import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://prosperwise.lovable.app",
  "https://app.prosperwise.ca",
  "https://id-preview--339dfc8f-3e82-4b05-8a36-a9f66fc58449.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

async function getValidToken(supabaseAdmin: any, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Google not connected");

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
    await supabaseAdmin
      .from("google_tokens")
      .update({ access_token: tokens.access_token, token_expiry: newExpiry })
      .eq("user_id", userId);
    return tokens.access_token;
  }
  return data.access_token;
}

function b64urlEncode(str: string) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str: string): string {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    try { return atob(s); } catch { return ""; }
  }
}

function extractBody(payload: any): { html: string; text: string } {
  let html = "", text = "";
  const walk = (p: any) => {
    if (!p) return;
    const mime = p.mimeType || "";
    if (p.body?.data) {
      const decoded = b64urlDecode(p.body.data);
      if (mime === "text/html" && !html) html = decoded;
      else if (mime === "text/plain" && !text) text = decoded;
    }
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  };
  walk(payload);
  return { html, text };
}

function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function buildRawEmail(opts: {
  to: string; subject: string; body: string; cc?: string; bcc?: string;
  inReplyTo?: string; references?: string; from?: string;
}) {
  const lines = [
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : "",
    opts.bcc ? `Bcc: ${opts.bcc}` : "",
    `Subject: ${opts.subject}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : "",
    opts.references ? `References: ${opts.references}` : "",
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    opts.body,
  ].filter(Boolean).join("\r\n");
  return b64urlEncode(lines);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const accessToken = await getValidToken(supabaseAdmin, user.id);
    const authH = { Authorization: `Bearer ${accessToken}` };

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const json = (obj: any, status = 200) =>
      new Response(JSON.stringify(obj), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ------- List individual messages (kept for backwards compat) -------
    if (action === "list") {
      const query = url.searchParams.get("q") || "";
      const maxResults = url.searchParams.get("maxResults") || "15";
      const labelIds = url.searchParams.get("labelIds") || "";
      const params: Record<string, string> = { maxResults };
      if (query) params.q = query;
      if (labelIds) params.labelIds = labelIds;

      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams(params)}`,
        { headers: authH },
      );
      if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}: ${await listRes.text()}`);
      const listData = await listRes.json();
      if (!listData.messages?.length) return json({ messages: [] });

      const details = await Promise.all(listData.messages.slice(0, parseInt(maxResults)).map(async (m: any) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
          { headers: authH },
        );
        return r.ok ? r.json() : null;
      }));
      const messages = details.filter(Boolean).map((msg: any) => ({
        id: msg.id, threadId: msg.threadId, snippet: msg.snippet,
        subject: getHeader(msg.payload?.headers || [], "Subject"),
        from: getHeader(msg.payload?.headers || [], "From"),
        to: getHeader(msg.payload?.headers || [], "To"),
        date: getHeader(msg.payload?.headers || [], "Date"),
        labelIds: msg.labelIds,
      }));
      return json({ messages });
    }

    // ------- List threads (Gmail-style inbox) -------
    if (action === "threads-list") {
      const query = url.searchParams.get("q") || "";
      const maxResults = url.searchParams.get("maxResults") || "30";
      const labelIds = url.searchParams.get("labelIds") || "";
      const pageToken = url.searchParams.get("pageToken") || "";
      const params: Record<string, string> = { maxResults };
      if (query) params.q = query;
      if (labelIds) params.labelIds = labelIds;
      if (pageToken) params.pageToken = pageToken;

      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads?${new URLSearchParams(params)}`,
        { headers: authH },
      );
      if (!listRes.ok) throw new Error(`Gmail threads ${listRes.status}: ${await listRes.text()}`);
      const listData = await listRes.json();
      if (!listData.threads?.length) return json({ threads: [], nextPageToken: null });

      const summaries = await Promise.all(listData.threads.map(async (t: any) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
          { headers: authH },
        );
        if (!r.ok) return null;
        const thread = await r.json();
        const msgs = thread.messages || [];
        const last = msgs[msgs.length - 1];
        const first = msgs[0];
        const labelIds: string[] = Array.from(new Set(msgs.flatMap((m: any) => m.labelIds || [])));
        const unread = msgs.some((m: any) => (m.labelIds || []).includes("UNREAD"));
        const starred = msgs.some((m: any) => (m.labelIds || []).includes("STARRED"));
        const fromSet = new Set<string>();
        msgs.forEach((m: any) => {
          const f = getHeader(m.payload?.headers || [], "From");
          if (f) fromSet.add(f);
        });
        return {
          id: thread.id,
          historyId: thread.historyId,
          snippet: last?.snippet || thread.snippet,
          subject: getHeader(first?.payload?.headers || [], "Subject"),
          from: getHeader(last?.payload?.headers || [], "From"),
          fromParticipants: Array.from(fromSet),
          date: getHeader(last?.payload?.headers || [], "Date"),
          messageCount: msgs.length,
          labelIds, unread, starred,
        };
      }));

      return json({
        threads: summaries.filter(Boolean),
        nextPageToken: listData.nextPageToken || null,
        resultSizeEstimate: listData.resultSizeEstimate,
      });
    }

    // ------- Get thread with full messages -------
    if (action === "thread-get") {
      const threadId = url.searchParams.get("threadId");
      if (!threadId) throw new Error("threadId required");
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
        { headers: authH },
      );
      if (!r.ok) throw new Error(`Gmail thread ${r.status}: ${await r.text()}`);
      const thread = await r.json();
      const messages = (thread.messages || []).map((m: any) => {
        const headers = m.payload?.headers || [];
        const body = extractBody(m.payload);
        return {
          id: m.id,
          threadId: m.threadId,
          internalDate: m.internalDate,
          snippet: m.snippet,
          labelIds: m.labelIds || [],
          headers: {
            subject: getHeader(headers, "Subject"),
            from: getHeader(headers, "From"),
            to: getHeader(headers, "To"),
            cc: getHeader(headers, "Cc"),
            date: getHeader(headers, "Date"),
            messageId: getHeader(headers, "Message-ID"),
            references: getHeader(headers, "References"),
          },
          bodyHtml: body.html,
          bodyText: body.text,
        };
      });
      return json({ id: thread.id, historyId: thread.historyId, messages });
    }

    // ------- Read single message (legacy) -------
    if (action === "read") {
      const messageId = url.searchParams.get("messageId");
      if (!messageId) throw new Error("messageId required");
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: authH },
      );
      if (!r.ok) throw new Error(`Gmail read ${r.status}`);
      return json(await r.json());
    }

    // ------- Modify labels (mark read/unread, star, archive, etc.) -------
    if (action === "modify") {
      const { messageId, threadId, addLabelIds = [], removeLabelIds = [] } = await req.json();
      const target = threadId
        ? `threads/${threadId}/modify`
        : `messages/${messageId}/modify`;
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/${target}`,
        {
          method: "POST",
          headers: { ...authH, "Content-Type": "application/json" },
          body: JSON.stringify({ addLabelIds, removeLabelIds }),
        },
      );
      if (!r.ok) throw new Error(`Gmail modify ${r.status}: ${await r.text()}`);
      return json(await r.json());
    }

    // ------- Trash (move to Trash) -------
    if (action === "trash") {
      const { messageId, threadId } = await req.json();
      const target = threadId
        ? `threads/${threadId}/trash`
        : `messages/${messageId}/trash`;
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/${target}`,
        { method: "POST", headers: authH },
      );
      if (!r.ok) throw new Error(`Gmail trash ${r.status}: ${await r.text()}`);
      return json(await r.json());
    }

    // ------- Untrash -------
    if (action === "untrash") {
      const { messageId, threadId } = await req.json();
      const target = threadId
        ? `threads/${threadId}/untrash`
        : `messages/${messageId}/untrash`;
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/${target}`,
        { method: "POST", headers: authH },
      );
      if (!r.ok) throw new Error(`Gmail untrash ${r.status}: ${await r.text()}`);
      return json(await r.json());
    }

    // ------- List labels -------
    if (action === "labels-list") {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/labels`,
        { headers: authH },
      );
      if (!r.ok) throw new Error(`Gmail labels ${r.status}`);
      return json(await r.json());
    }

    // ------- Send (with optional reply threading) -------
    if (action === "send") {
      const body = await req.json();
      const raw = buildRawEmail({
        to: body.to, subject: body.subject, body: body.body,
        cc: body.cc, bcc: body.bcc,
        inReplyTo: body.inReplyTo, references: body.references,
      });
      const payload: any = { raw };
      if (body.threadId) payload.threadId = body.threadId;
      const r = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: { ...authH, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!r.ok) throw new Error(`Gmail send ${r.status}: ${await r.text()}`);
      return json(await r.json());
    }

    // ------- Draft -------
    if (action === "draft") {
      const body = await req.json();
      const raw = buildRawEmail({
        to: body.to, subject: body.subject, body: body.body,
        cc: body.cc, bcc: body.bcc,
        inReplyTo: body.inReplyTo, references: body.references,
      });
      const message: any = { raw };
      if (body.threadId) message.threadId = body.threadId;
      const r = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        {
          method: "POST",
          headers: { ...authH, "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        },
      );
      if (!r.ok) throw new Error(`Gmail draft ${r.status}: ${await r.text()}`);
      return json(await r.json());
    }

    // ------- Profile (get "me" email) -------
    if (action === "profile") {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/profile`,
        { headers: authH },
      );
      if (!r.ok) throw new Error(`Gmail profile ${r.status}`);
      return json(await r.json());
    }

    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    console.error("google-gmail error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
