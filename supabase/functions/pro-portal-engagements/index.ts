import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateProSession } from "../_shared/pro-portal-auth.ts";

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
      "authorization, x-client-info, apikey, content-type, x-pro-session",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Resolve a short label for a given engagement scope so the pro sees
// something meaningful without exposing raw IDs.
async function resolveScopeLabel(
  supabase: any,
  scope_type: string,
  scope_id: string,
): Promise<string> {
  try {
    if (scope_type === "family") {
      const { data } = await supabase.from("families").select("name").eq("id", scope_id).maybeSingle();
      return data?.name || "Family";
    }
    if (scope_type === "household") {
      const { data } = await supabase.from("households").select("label").eq("id", scope_id).maybeSingle();
      return data?.label || "Household";
    }
    if (scope_type === "contact") {
      const { data } = await supabase
        .from("contacts").select("full_name, first_name, last_name").eq("id", scope_id).maybeSingle();
      return data?.full_name || [data?.first_name, data?.last_name].filter(Boolean).join(" ") || "Client";
    }
  } catch {/* swallow */}
  return scope_type;
}

async function resolveSharedFiles(supabase: any, share_link_id: string | null) {
  if (!share_link_id) return [];
  // V1: surface only the share-link metadata; secure download proxy is
  // wired up in a follow-up phase (vault-service proPortalReadFile action).
  const { data: link } = await supabase
    .from("vault_share_links")
    .select("id, drive_id, scope_type, expires_at, revoked_at")
    .eq("id", share_link_id)
    .maybeSingle();
  if (!link || link.revoked_at) return [];
  if (link.expires_at && new Date(link.expires_at) <= new Date()) return [];
  return [{
    id: link.id,
    name: `Shared ${link.scope_type} drive`,
    mime_type: "application/vnd.prosperwise.vault-share",
    size_bytes: null,
    created_at: null,
  }];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const sessionToken = req.headers.get("x-pro-session");
    const session = await validateProSession(supabase, sessionToken);
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = (body.action as string) || "list";

    if (action === "list") {
      const { data: engagements } = await supabase
        .from("professional_engagements")
        .select("id, title, pillar, scope_type, scope_id, status, started_at, completed_at, created_at, vault_share_link_id")
        .eq("professional_id", session.professional_id)
        .in("status", ["invited", "active", "completed"])
        .order("created_at", { ascending: false });

      // Hydrate scope labels + unread counts
      const list = await Promise.all(
        (engagements || []).map(async (e: any) => {
          const scope_label = await resolveScopeLabel(supabase, e.scope_type, e.scope_id);
          const { count: unread } = await supabase
            .from("engagement_messages")
            .select("id", { count: "exact", head: true })
            .eq("engagement_id", e.id)
            .neq("sender_type", "pro")
            .is("read_by_pro_at", null);
          return { ...e, scope_label, unread_count: unread || 0 };
        }),
      );

      return new Response(JSON.stringify({ engagements: list }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get") {
      const engagementId = body.engagement_id as string;
      if (!engagementId) {
        return new Response(JSON.stringify({ error: "engagement_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: engagement } = await supabase
        .from("professional_engagements")
        .select("*")
        .eq("id", engagementId)
        .eq("professional_id", session.professional_id)
        .maybeSingle();
      if (!engagement) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const scope_label = await resolveScopeLabel(supabase, engagement.scope_type, engagement.scope_id);
      const files = await resolveSharedFiles(supabase, engagement.vault_share_link_id);
      const { data: messages } = await supabase
        .from("engagement_messages")
        .select("id, sender_type, sender_id, body, attachments, created_at, read_by_pro_at, read_by_staff_at")
        .eq("engagement_id", engagementId)
        .order("created_at", { ascending: true });

      // Mark inbound messages as read by pro
      const now = new Date().toISOString();
      const unreadIds = (messages || [])
        .filter((m: any) => m.sender_type !== "pro" && !m.read_by_pro_at)
        .map((m: any) => m.id);
      if (unreadIds.length > 0) {
        await supabase
          .from("engagement_messages")
          .update({ read_by_pro_at: now })
          .in("id", unreadIds);
      }

      return new Response(
        JSON.stringify({ engagement: { ...engagement, scope_label }, files, messages: messages || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pro-portal-engagements] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
