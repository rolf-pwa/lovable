// Uses Deno.serve (no std import needed)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dump-secret",
};

async function getValidToken(sb: any, userId: string): Promise<string> {
  const { data, error } = await sb.from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error(`No google_tokens row for user_id ${userId}`);

  if (new Date(data.token_expiry) <= new Date()) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokens = await res.json();
    if (tokens.error) throw new Error(`Token refresh failed: ${tokens.error}`);
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await sb.from("google_tokens").update({ access_token: tokens.access_token, token_expiry: newExpiry }).eq("user_id", userId);
    return tokens.access_token;
  }
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Shared-secret auth (cron and manual triggers both send x-dump-secret)
    const expectedSecret = Deno.env.get("DAILY_DUMP_SECRET");
    const provided = req.headers.get("x-dump-secret");
    if (!expectedSecret || provided !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const folderIdRaw = Deno.env.get("DAILY_DUMP_DRIVE_FOLDER_ID");
    const googleUserId = Deno.env.get("DAILY_DUMP_GOOGLE_USER_ID");
    if (!folderIdRaw) throw new Error("DAILY_DUMP_DRIVE_FOLDER_ID not configured");
    // Accept either a raw folder ID or a full Drive URL and extract the ID.
    const folderId = (folderIdRaw.match(/folders\/([a-zA-Z0-9_-]+)/) || [null, folderIdRaw.trim()])[1];
    if (!googleUserId) throw new Error("DAILY_DUMP_GOOGLE_USER_ID not configured");

    // Determine target date. If invoked after midnight for "yesterday", body may pass { date }.
    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body?.date || defaultYesterday();
    } catch {
      targetDate = defaultYesterday();
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get recap markdown by invoking recap-draft
    const recapRes = await fetch(`${SUPABASE_URL}/functions/v1/recap-draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ date: targetDate }),
    });
    if (!recapRes.ok) throw new Error(`recap-draft failed: ${await recapRes.text()}`);
    const { draft } = await recapRes.json();

    // 2. Get Google token
    const gToken = await getValidToken(sb, googleUserId);

    // 3. Create Google Doc in target folder
    const title = `ProsperWise Daily Dump — ${targetDate}`;
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: title,
        mimeType: "application/vnd.google-apps.document",
        parents: [folderId],
      }),
    });
    if (!createRes.ok) throw new Error(`Drive create failed: ${await createRes.text()}`);
    const docFile = await createRes.json();
    const docId = docFile.id;

    // 4. Insert content into the Doc via batchUpdate
    const requests = markdownToDocsRequests(draft, `${title}\n\n`);
    const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });
    if (!updateRes.ok) throw new Error(`Docs batchUpdate failed: ${await updateRes.text()}`);

    const webViewLink = `https://docs.google.com/document/d/${docId}/edit`;
    console.log(`[daily-dump-export] Created ${title} → ${webViewLink}`);

    return new Response(
      JSON.stringify({ ok: true, date: targetDate, docId, webViewLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("daily-dump-export error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function defaultYesterday(): string {
  // "Yesterday" in America/Toronto (ET). Cron runs just after ET midnight.
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/Toronto" }));
  et.setDate(et.getDate() - 1);
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, "0");
  const d = String(et.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Very small markdown -> Google Docs batchUpdate translator.
 * Supports: `## heading`, `- bullet`, `  - nested bullet`, and plain paragraphs.
 * Inserts content sequentially from index 1, then applies paragraph styles.
 */
function markdownToDocsRequests(md: string, prefix: string) {
  const requests: any[] = [];
  let index = 1;
  const styleOps: any[] = [];

  const pushText = (text: string) => {
    requests.push({ insertText: { location: { index }, text } });
    const start = index;
    index += text.length;
    return { start, end: index };
  };

  // Title
  const titleRange = pushText(prefix);
  styleOps.push({
    updateParagraphStyle: {
      range: { startIndex: titleRange.start, endIndex: titleRange.end },
      paragraphStyle: { namedStyleType: "TITLE" },
      fields: "namedStyleType",
    },
  });

  const lines = md.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") {
      pushText("\n");
      continue;
    }

    if (line.startsWith("## ")) {
      const text = line.slice(3) + "\n";
      const r = pushText(text);
      styleOps.push({
        updateParagraphStyle: {
          range: { startIndex: r.start, endIndex: r.end },
          paragraphStyle: { namedStyleType: "HEADING_2" },
          fields: "namedStyleType",
        },
      });
    } else if (line.startsWith("# ")) {
      const text = line.slice(2) + "\n";
      const r = pushText(text);
      styleOps.push({
        updateParagraphStyle: {
          range: { startIndex: r.start, endIndex: r.end },
          paragraphStyle: { namedStyleType: "HEADING_1" },
          fields: "namedStyleType",
        },
      });
    } else if (/^\s*-\s+/.test(line)) {
      const nested = line.startsWith("  ");
      const text = line.replace(/^\s*-\s+/, "") + "\n";
      const r = pushText(text);
      styleOps.push({
        createParagraphBullets: {
          range: { startIndex: r.start, endIndex: r.end },
          bulletPreset: nested ? "BULLET_DIAMONDX_ARROW3D_SQUARE" : "BULLET_DISC_CIRCLE_SQUARE",
        },
      });
    } else {
      pushText(line + "\n");
    }
  }

  return [...requests, ...styleOps];
}
