// Pro Portal Asana task bridge. Reads/creates/comments/completes tasks in the
// family's Asana project, filtered to a pro by a naming convention:
//   Task or subtask names/notes that contain "[Pro: <full_name>]"
// New tasks created via the portal are auto-prefixed with the pro's marker so
// they surface here on next load.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateProSession } from "../_shared/pro-portal-auth.ts";

const ALLOWED_ORIGINS = [
  "https://prosperwise.lovable.app",
  "https://app.prosperwise.ca",
  "https://id-preview--339dfc8f-3e82-4b05-8a36-a9f66fc58449.lovable.app",
];
function cors(req: Request) {
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
const ASANA_TOKEN = Deno.env.get("ASANA_ACCESS_TOKEN")!;
const ASANA_BASE = "https://app.asana.com/api/1.0";

function extractProjectGid(url: string | null): string | null {
  if (!url) return null;
  const m1 = url.match(/\/project\/(\d+)/);
  if (m1) return m1[1];
  const m2 = url.match(/app\.asana\.com\/0\/(\d+)/);
  if (m2) return m2[1];
  return null;
}

async function asana(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ASANA_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Asana ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// Resolve which Asana project the pro is operating against, plus the section
// that scopes their view (household or family).
async function resolveProject(
  supabase: any,
  scopeType: "family" | "household" | "contact",
  scopeId: string,
): Promise<{ projectGid: string | null; sectionHint: string | null }> {
  // Contact scope: use their own asana_url
  if (scopeType === "contact") {
    const { data: c } = await supabase
      .from("contacts").select("asana_url, household_id, family_id").eq("id", scopeId).maybeSingle();
    if (c?.asana_url) return { projectGid: extractProjectGid(c.asana_url), sectionHint: null };
    if (c?.household_id) return resolveProject(supabase, "household", c.household_id);
    if (c?.family_id) return resolveProject(supabase, "family", c.family_id);
  }
  // Household: try any member's asana_url; sectionHint = household label
  if (scopeType === "household") {
    const { data: members } = await supabase
      .from("contacts").select("asana_url").eq("household_id", scopeId).not("asana_url", "is", null).limit(1);
    const url = members?.[0]?.asana_url;
    const { data: hh } = await supabase.from("households").select("label, family_id").eq("id", scopeId).maybeSingle();
    if (url) return { projectGid: extractProjectGid(url), sectionHint: hh?.label || null };
    if (hh?.family_id) {
      const parent = await resolveProject(supabase, "family", hh.family_id);
      return { projectGid: parent.projectGid, sectionHint: hh?.label || null };
    }
  }
  // Family: pick any member of any household in the family with an asana_url
  if (scopeType === "family") {
    const { data: hhs } = await supabase.from("households").select("id").eq("family_id", scopeId);
    const hhIds = (hhs || []).map((h: any) => h.id);
    if (hhIds.length) {
      const { data: anyMember } = await supabase
        .from("contacts").select("asana_url").in("household_id", hhIds).not("asana_url", "is", null).limit(1);
      const url = anyMember?.[0]?.asana_url;
      if (url) return { projectGid: extractProjectGid(url), sectionHint: null };
    }
    const { data: directContacts } = await supabase
      .from("contacts").select("asana_url").eq("family_id", scopeId).not("asana_url", "is", null).limit(1);
    const url = directContacts?.[0]?.asana_url;
    if (url) return { projectGid: extractProjectGid(url), sectionHint: null };
  }
  return { projectGid: null, sectionHint: null };
}

function proMarker(fullName: string) {
  return `[Pro: ${fullName}]`;
}

function matchesPro(text: string | null | undefined, marker: string) {
  if (!text) return false;
  return text.toLowerCase().includes(marker.toLowerCase());
}

serve(async (req) => {
  const corsHeaders = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const session = await validateProSession(supabase, req.headers.get("x-pro-session"));
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ASANA_TOKEN) {
      return new Response(JSON.stringify({ tasks: [], warning: "Asana not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = (body.action as string) || "list";
    const marker = proMarker(session.professional.full_name);

    if (action === "list") {
      const scopeType = body.scope_type as "family" | "household" | "contact";
      const scopeId = body.scope_id as string;
      if (!scopeType || !scopeId) {
        return new Response(JSON.stringify({ error: "scope required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { projectGid, sectionHint } = await resolveProject(supabase, scopeType, scopeId);
      if (!projectGid) {
        return new Response(JSON.stringify({ tasks: [], projectGid: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Fetch tasks in project with relevant fields
      const result = await asana(
        `/tasks?project=${projectGid}&opt_fields=name,notes,completed,due_on,memberships.section.name,num_subtasks,created_at,modified_at&limit=100`,
      );
      const tasks = (result.data || [])
        .filter((t: any) => matchesPro(t.name, marker) || matchesPro(t.notes, marker))
        .filter((t: any) => {
          if (scopeType !== "household" || !sectionHint) return true;
          return (t.memberships || []).some((m: any) => m.section?.name?.toLowerCase().includes(sectionHint.toLowerCase()));
        })
        .map((t: any) => ({
          gid: t.gid,
          name: (t.name || "").replace(marker, "").trim() || t.name,
          notes: t.notes || "",
          completed: !!t.completed,
          due_on: t.due_on || null,
          section: t.memberships?.[0]?.section?.name || null,
          num_subtasks: t.num_subtasks || 0,
          modified_at: t.modified_at,
        }));
      return new Response(JSON.stringify({ tasks, projectGid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "stories") {
      const taskGid = body.task_gid as string;
      if (!taskGid) return new Response(JSON.stringify({ error: "task_gid required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await asana(`/tasks/${taskGid}/stories?opt_fields=text,created_at,created_by.name,type`);
      const stories = (result.data || [])
        .filter((s: any) => s.type === "comment")
        .map((s: any) => ({ gid: s.gid, text: s.text, created_at: s.created_at, author: s.created_by?.name || "ProsperWise" }));
      return new Response(JSON.stringify({ stories }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "comment") {
      const taskGid = body.task_gid as string;
      const text = (body.text as string || "").trim();
      if (!taskGid || !text) return new Response(JSON.stringify({ error: "task_gid and text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const attributed = `${session.professional.full_name} (via Pro Portal):\n${text}`;
      const result = await asana(`/tasks/${taskGid}/stories`, {
        method: "POST",
        body: JSON.stringify({ data: { text: attributed } }),
      });
      return new Response(JSON.stringify({ ok: true, story: result.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "complete") {
      const taskGid = body.task_gid as string;
      const completed = body.completed !== false;
      if (!taskGid) return new Response(JSON.stringify({ error: "task_gid required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await asana(`/tasks/${taskGid}`, {
        method: "PUT",
        body: JSON.stringify({ data: { completed } }),
      });
      // Post a note so staff sees who closed it
      await asana(`/tasks/${taskGid}/stories`, {
        method: "POST",
        body: JSON.stringify({ data: { text: `${session.professional.full_name} marked this ${completed ? "complete" : "reopened"} via Pro Portal.` } }),
      }).catch(() => {/* noop */});
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const scopeType = body.scope_type as "family" | "household" | "contact";
      const scopeId = body.scope_id as string;
      const title = (body.title as string || "").trim();
      const notes = (body.notes as string || "").trim();
      if (!scopeType || !scopeId || !title) {
        return new Response(JSON.stringify({ error: "scope + title required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { projectGid } = await resolveProject(supabase, scopeType, scopeId);
      if (!projectGid) {
        return new Response(JSON.stringify({ error: "No Asana project linked to this scope" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const attributedTitle = `${marker} ${title}`;
      const attributedNotes = `Requested by ${session.professional.full_name} (${session.professional.firm || session.professional.professional_type}) via Pro Portal.\n\n${notes}`;
      const result = await asana(`/tasks`, {
        method: "POST",
        body: JSON.stringify({ data: { projects: [projectGid], name: attributedTitle, notes: attributedNotes } }),
      });
      // Notify staff via bell
      try {
        await supabase.from("staff_notifications").insert({
          source_type: "pro_request",
          title: `New pro request: ${title}`,
          body: `${session.professional.full_name} opened a task via the Pro Portal.`,
          link: `https://app.asana.com/0/${projectGid}/${result.data?.gid || ""}`,
        });
      } catch {/* noop */}
      return new Response(JSON.stringify({ ok: true, task: result.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pro-portal-tasks] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
