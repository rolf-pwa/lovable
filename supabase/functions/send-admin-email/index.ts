// send-admin-email
// Sends transactional notifications from admin@prosperwise.ca via the
// Lovable Gmail connector gateway. Additive to the Wix relay — callers
// decide whether to invoke this based on NOTIFICATION_CHANNEL.
//
// Runs PII Shield BEFORE building the raw RFC 2822 message; rejects with
// 422 on hit. JWT validated in code.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkOutboundPii } from "../_shared/pii-shield.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const SENDER_DISPLAY = "ProsperWise <admin@prosperwise.ca>";

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
      "authorization, x-client-info, apikey, content-type, x-internal-call",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function base64UrlEncode(input: string): string {
  // Use TextEncoder + manual base64 to support unicode bodies
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function asList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
}

function buildRawEmail(opts: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}): string {
  const headers: string[] = [
    `From: ${SENDER_DISPLAY}`,
    `To: ${opts.to.join(", ")}`,
  ];
  if (opts.cc && opts.cc.length) headers.push(`Cc: ${opts.cc.join(", ")}`);
  if (opts.bcc && opts.bcc.length) headers.push(`Bcc: ${opts.bcc.join(", ")}`);
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  // RFC 2047 encode subject if needed
  const subjectEncoded = /[^\x00-\x7F]/.test(opts.subject)
    ? `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`
    : opts.subject;
  headers.push(`Subject: ${subjectEncoded}`);
  headers.push("MIME-Version: 1.0");

  let body: string;
  if (opts.html && opts.text) {
    const boundary = `pw_boundary_${crypto.randomUUID()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      opts.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      opts.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  } else if (opts.html) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    body = `\r\n${opts.html}`;
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    body = `\r\n${opts.text ?? ""}`;
  }

  return headers.join("\r\n") + "\r\n" + body;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!GOOGLE_MAIL_API_KEY) {
    return new Response(JSON.stringify({ error: "GOOGLE_MAIL_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth: either a Supabase JWT (logged-in staff/server) or an internal call
  // marker from another edge function using the service role key.
  const authHeader = req.headers.get("Authorization") || "";
  const isInternal = req.headers.get("x-internal-call") === "1";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");

  if (!isInternal) {
    // Validate as a real user JWT
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    // Internal call: must match service role key
    if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return new Response(JSON.stringify({ error: "Unauthorized internal call" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const to = asList(payload.to);
  const cc = asList(payload.cc);
  const bcc = asList(payload.bcc);
  const subject = String(payload.subject ?? "").trim();
  const text = typeof payload.text === "string" ? payload.text : undefined;
  const html = typeof payload.html === "string" ? payload.html : undefined;
  const replyTo = typeof payload.replyTo === "string" ? payload.replyTo : undefined;

  if (to.length === 0 || !subject || (!text && !html)) {
    return new Response(
      JSON.stringify({ error: "Required: to, subject, and at least one of text/html" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // PII Shield — block financial/health PII before it leaves Canadian infra
  const piiCheckText = `${subject}\n${text ?? ""}\n${html ?? ""}`;
  const pii = checkOutboundPii(piiCheckText);
  if (pii.blocked) {
    console.warn(`[send-admin-email] PII Shield blocked: ${pii.reason} (${pii.matched})`);
    return new Response(
      JSON.stringify({ error: "PII Shield blocked", reason: pii.reason }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const raw = buildRawEmail({ to, cc, bcc, subject, text, html, replyTo });
  const rawEncoded = base64UrlEncode(raw);

  try {
    const gmRes = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: rawEncoded }),
    });

    const gmBody = await gmRes.text();
    if (!gmRes.ok) {
      console.error(`[send-admin-email] Gmail API failed [${gmRes.status}]: ${gmBody}`);
      return new Response(
        JSON.stringify({ error: "Gmail send failed", status: gmRes.status, body: gmBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = JSON.parse(gmBody);
    console.log(`[send-admin-email] Sent to ${to.join(",")} (id: ${parsed.id})`);
    return new Response(
      JSON.stringify({ sent: true, messageId: parsed.id, threadId: parsed.threadId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-admin-email] Unexpected error:", msg);
    return new Response(JSON.stringify({ error: "Internal error", details: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
