// email-track — public, unauthenticated (verify_jwt = false in config.toml).
// An <img src> / <a href> loaded by an email client sends zero custom
// headers -- no apikey, no Authorization -- so the default JWT gate would
// 401 before this ever ran. Service-role client only; RLS on both tables
// grants nothing to anon, by design.
//
// action=pixel&t=<tracking_token>  -- records an open, returns a 1x1 GIF.
// action=click&l=<link_row_id>     -- records a click, 302s to the real URL,
//   resolved server-side by this row's own id ONLY. The target URL is never
//   accepted from the request itself -- avoids an open-redirect vector on a
//   publicly reachable endpoint.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_URL = "https://app.prosperwise.ca";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

// 1x1 transparent GIF.
const PIXEL_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7"),
  (c) => c.charCodeAt(0),
);

const NO_CACHE_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

async function recordOpen(db: ReturnType<typeof admin>, token: string) {
  const { data } = await db
    .from("contact_emails")
    .select("id, open_count, opened_at")
    .eq("tracking_token", token)
    .maybeSingle();
  if (!data) return;
  await db
    .from("contact_emails")
    .update({
      open_count: (data.open_count || 0) + 1,
      last_opened_at: new Date().toISOString(),
      ...(data.opened_at ? {} : { opened_at: new Date().toISOString() }),
    })
    .eq("id", data.id);
}

async function recordClick(db: ReturnType<typeof admin>, linkId: string): Promise<string | null> {
  const { data } = await db
    .from("contact_email_links")
    .select("id, target_url, click_count, clicked_at")
    .eq("id", linkId)
    .maybeSingle();
  if (!data) return null;
  await db
    .from("contact_email_links")
    .update({
      click_count: (data.click_count || 0) + 1,
      last_clicked_at: new Date().toISOString(),
      ...(data.clicked_at ? {} : { clicked_at: new Date().toISOString() }),
    })
    .eq("id", data.id);
  return data.target_url as string;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const db = admin();

  try {
    if (action === "pixel") {
      const token = url.searchParams.get("t");
      // Never surface whether the token matched -- always return the pixel
      // either way, so a broken image never appears in the inbox.
      if (token) await recordOpen(db, token);
      return new Response(PIXEL_GIF, { headers: NO_CACHE_HEADERS });
    }

    if (action === "click") {
      const linkId = url.searchParams.get("l");
      const targetUrl = linkId ? await recordClick(db, linkId) : null;
      return Response.redirect(targetUrl || FALLBACK_URL, 302);
    }

    return new Response("Not found", { status: 404 });
  } catch (e) {
    console.error("email-track error:", e);
    // Never error out visibly -- pixel still renders, click still redirects.
    if (action === "click") return Response.redirect(FALLBACK_URL, 302);
    return new Response(PIXEL_GIF, { headers: NO_CACHE_HEADERS });
  }
});
