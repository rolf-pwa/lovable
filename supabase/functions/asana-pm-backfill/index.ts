// One-time (safely re-runnable) backfill: pulls each Asana-linked contact's
// historical tasks, subtasks, and comment threads into pm_tasks/pm_task_comments
// before the Asana integration is decommissioned. Staff-only, not exposed to
// any portal. Reuses the same Asana REST endpoints/opt_fields asana-service
// already calls live -- this just runs them once in bulk instead of per click.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://prosperwise-portal.web.app",
  "https://prosperwise.lovable.app",
  "https://app.prosperwise.ca",
  "https://id-preview--339dfc8f-3e82-4b05-8a36-a9f66fc58449.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const ASANA_BASE_URL = "https://app.asana.com/api/1.0";
const ASANA_TOKEN = Deno.env.get("ASANA_ACCESS_TOKEN")!;

async function withFailSafe<T>(label: string, fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`[asana-pm-backfill] ${label} failed after ${maxRetries} attempts:`, err);
        throw err;
      }
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 16000)));
    }
  }
}

async function asanaGet(path: string) {
  const res = await fetch(`${ASANA_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${ASANA_TOKEN}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.errors?.[0]?.message || `Asana API error (${res.status})`);
  return json.data;
}

// Asana paginates list endpoints at up to 100 items per page (our own
// `limit=100`) -- a project/task/comment-thread with more than that would
// silently truncate without this. Follows next_page.offset until exhausted.
async function asanaGetAllPages(path: string): Promise<any[]> {
  let results: any[] = [];
  let offset: string | undefined;
  while (true) {
    const url = offset ? `${path}${path.includes("?") ? "&" : "?"}offset=${offset}` : path;
    const res = await fetch(`${ASANA_BASE_URL}${url}`, {
      headers: { Authorization: `Bearer ${ASANA_TOKEN}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.errors?.[0]?.message || `Asana API error (${res.status})`);
    results = results.concat(json.data || []);
    if (!json.next_page?.offset) break;
    offset = json.next_page.offset;
  }
  return results;
}

function extractProjectGid(asanaUrl: string | null): string | null {
  if (!asanaUrl) return null;
  const newMatch = asanaUrl.match(/\/project\/(\d+)/);
  if (newMatch) return newMatch[1];
  const oldMatch = asanaUrl.match(/app\.asana\.com\/0\/(\d+)/);
  return oldMatch ? oldMatch[1] : null;
}

// Verbatim from asana-service/index.ts -- a contact's asana_url is either
// task-based (linked to one specific task -- the common case, since every
// modern Asana URL contains /task/{id}) or project-based (linked to a whole
// project). Getting this branch wrong is exactly what caused the first
// version of this script to import entire large shared projects instead of
// just each contact's own linked task.
function isTaskUrl(asanaUrl: string | null): boolean {
  if (!asanaUrl) return false;
  if (/\/task\/\d+/.test(asanaUrl)) return true;
  if (/\/project\/\d+\/list\/\d+/.test(asanaUrl)) return true;
  if (/app\.asana\.com\/0\/\d+\/f/.test(asanaUrl)) return true;
  if (/app\.asana\.com\/0\/\d+\/\d+/.test(asanaUrl) && !/\/(list|board|timeline|calendar)/.test(asanaUrl)) return true;
  return false;
}

function extractTaskGid(asanaUrl: string | null): string | null {
  if (!asanaUrl) return null;
  const newTaskMatch = asanaUrl.match(/\/task\/(\d+)/);
  if (newTaskMatch) return newTaskMatch[1];
  const listTaskMatch = asanaUrl.match(/\/project\/\d+\/list\/(\d+)/);
  if (listTaskMatch) return listTaskMatch[1];
  const twoSegment = asanaUrl.match(/app\.asana\.com\/0\/\d+\/(\d+)/);
  if (twoSegment) return twoSegment[1];
  const singleSegment = asanaUrl.match(/app\.asana\.com\/0\/(\d+)\/f/);
  return singleSegment ? singleSegment[1] : null;
}

function inferStatus(task: any): "open" | "in_progress" | "done" {
  if (task.completed) return "done";
  const section = (task.memberships?.[0]?.section?.name || "").toLowerCase();
  if (["progress", "doing", "review", "awaiting", "ongoing"].some((k) => section.includes(k))) return "in_progress";
  return "open";
}

// Same rule asana-service's own client-portal gate used (filterVisible in
// getTasksForProject): a task is client-visible only if explicitly tagged
// with the PW_Visibility custom field set to "Client Visible" -- absence of
// the tag means internal/staff-only, matching Asana's own conservative
// default. Requires opt_fields=custom_fields on the task fetch.
function isClientVisible(task: any): boolean {
  const customFields = task.custom_fields || [];
  return customFields.some(
    (cf: any) =>
      (cf.name === "PW_Visibility" || cf.name?.toLowerCase().includes("visibility")) &&
      cf.enum_value?.name === "Client Visible",
  );
}

// Timing-safe comparison for shared secrets (fixed-time regardless of match position).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function requireStaff(req: Request): Promise<{ userId: string; error?: undefined } | { error: string }> {
  // One-time backfill run: allow a purpose-built internal secret as an
  // alternative to a real staff session, mirroring the established
  // x-internal-secret pattern (security-audit, vault-service, etc.).
  const internalSecretHeader = req.headers.get("x-internal-secret") || "";
  const BACKFILL_SECRET = Deno.env.get("ASANA_BACKFILL_SECRET") || "";
  if (internalSecretHeader.length > 0 && BACKFILL_SECRET.length > 0 && timingSafeEqual(internalSecretHeader, BACKFILL_SECRET)) {
    return { userId: "140aaffa-abce-4de8-9756-7013f32642d0" };
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return { error: "Missing authorization header" };
  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabaseUser.auth.getUser();
  if (error || !data?.user) return { error: "Not authenticated" };
  if (!data.user.email?.endsWith("@prosperwise.ca")) return { error: "Not authorized" };
  return { userId: data.user.id };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = await requireStaff(req);
    if (auth.error) return json({ error: auth.error }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { contact_id, action } = body;

    // Re-scan already-imported tasks against their real Asana PW_Visibility
    // tag and correct client_visible -- a security fix for the initial
    // backfill, which defaulted every task to client_visible = true instead
    // of checking Asana's own visibility gate.
    if (action === "reclassifyVisibility") {
      let tasksQuery = admin.from("pm_tasks").select("id, asana_gid, contact_id, parent_task_id").not("asana_gid", "is", null);
      if (contact_id) tasksQuery = tasksQuery.eq("contact_id", contact_id);
      const { data: tasksToScan, error: scanErr } = await tasksQuery;
      if (scanErr) return json({ error: scanErr.message }, 500);

      const scanSummary = {
        scanned: 0,
        markedVisible: 0,
        keptInternal: 0,
        errors: [] as { taskId: string; message: string }[],
      };
      for (const t of tasksToScan || []) {
        try {
          // The linked root task itself is never client-visible -- only its
          // subtasks are eligible, per Asana's PW_Visibility tag on each.
          // Skip the Asana lookup entirely for root tasks; force internal.
          const visible = t.parent_task_id === null ? false : isClientVisible(
            await withFailSafe(`getTask(${t.asana_gid})`, () =>
              asanaGet(`/tasks/${t.asana_gid}?opt_fields=custom_fields`),
            ),
          );
          const { error: updateErr } = await admin.from("pm_tasks").update({ client_visible: visible }).eq("id", t.id);
          if (updateErr) throw new Error(updateErr.message);
          scanSummary.scanned++;
          if (visible) scanSummary.markedVisible++;
          else scanSummary.keptInternal++;
        } catch (e) {
          scanSummary.errors.push({ taskId: t.id, message: e instanceof Error ? e.message : String(e) });
        }
      }
      return json({ ok: true, scanSummary });
    }

    let contactsQuery = admin
      .from("contacts")
      .select("id, household_id, asana_url")
      .not("asana_url", "is", null)
      .neq("asana_url", "");
    if (contact_id) contactsQuery = contactsQuery.eq("id", contact_id);
    const { data: contacts, error: contactsError } = await contactsQuery;
    if (contactsError) return json({ error: contactsError.message }, 500);

    const summary = {
      contactsProcessed: 0,
      tasksImported: 0,
      subtasksImported: 0,
      commentsImported: 0,
      skippedExisting: 0,
      errors: [] as { contactId: string; message: string }[],
    };

    const importComments = async (taskGid: string, pmTaskId: string) => {
      const stories = await withFailSafe(`getTaskStories(${taskGid})`, () =>
        asanaGetAllPages(`/tasks/${taskGid}/stories?opt_fields=text,created_by.name,created_at,resource_subtype`),
      );
      const comments = (stories || []).filter(
        (s: any) => (!s.resource_subtype || s.resource_subtype === "comment_added") && s.text?.trim(),
      );
      for (const story of comments) {
        // The old client-portal integration posted client replies through the
        // shared Asana PAT identity, faking authorship with a "[Name]: " text
        // prefix (see this session's now-deleted PortalTaskConversation.tsx).
        // Asana's own created_by.name is unreliable for these -- it always
        // says the PAT's name (Rolf) even when the prefix shows it was really
        // the client. Detect and correct for it here.
        const clientPrefixMatch = story.text.match(/^\[(.+?)\]:\s*/);
        const authorLabel = clientPrefixMatch ? `${clientPrefixMatch[1]} (via client portal)` : story.created_by?.name || "Asana";
        const text = clientPrefixMatch ? story.text.slice(clientPrefixMatch[0].length) : story.text;
        const when = story.created_at ? new Date(story.created_at).toLocaleDateString("en-US") : "unknown date";
        const { error } = await admin.from("pm_task_comments").insert({
          task_id: pmTaskId,
          body: `[Imported from Asana — originally posted by ${authorLabel}, ${when}]\n\n${text}`,
        });
        if (!error) summary.commentsImported++;
      }
    };

    const importTask = async (
      task: any,
      contactId: string,
      householdId: string | null,
      parentTaskId: string | null,
    ) => {
      // Scoped to (asana_gid, contact_id): several contacts share the exact
      // same Asana project across different households, so dedup must be
      // per-contact, not just per Asana task -- otherwise whichever contact
      // gets processed first "wins" and the other sees nothing.
      const { data: existing } = await admin
        .from("pm_tasks")
        .select("id")
        .eq("asana_gid", task.gid)
        .eq("contact_id", contactId)
        .maybeSingle();
      if (existing) {
        summary.skippedExisting++;
        return existing.id;
      }

      const { data: inserted, error } = await admin
        .from("pm_tasks")
        .insert({
          title: task.name,
          description: task.notes || null,
          status: inferStatus(task),
          due_date: task.due_on || null,
          contact_id: contactId,
          household_id: householdId,
          parent_task_id: parentTaskId,
          // The linked task itself (parentTaskId === null, i.e. what a
          // contact's asana_url points to) is a structural container/anchor,
          // never a real client-facing item -- only its subtasks represent
          // actual work items eligible for client visibility.
          client_visible: parentTaskId === null ? false : isClientVisible(task),
          asana_gid: task.gid,
          created_by: "140aaffa-abce-4de8-9756-7013f32642d0",
        })
        .select("id")
        .maybeSingle();
      if (error || !inserted) throw new Error(error?.message || "Insert failed");

      if (parentTaskId === null) summary.tasksImported++;
      else summary.subtasksImported++;

      await importComments(task.gid, inserted.id);
      return inserted.id;
    };

    // A root task's Asana gid to import, per contact -- either the one task
    // their URL is directly linked to (the common case), or every task in
    // their linked project (rare; only when the URL has no /task/ segment
    // at all). Never both, and never "every task that happens to share a
    // project with this one" -- that was the bug in the first version.
    const rootTasksFor = async (asanaUrl: string): Promise<any[]> => {
      if (isTaskUrl(asanaUrl)) {
        const taskGid = extractTaskGid(asanaUrl);
        if (!taskGid) return [];
        const task = await withFailSafe(`getTask(${taskGid})`, () =>
          asanaGet(`/tasks/${taskGid}?opt_fields=name,completed,due_on,notes,memberships.section.name,custom_fields`),
        );
        return task ? [task] : [];
      }
      const projectGid = extractProjectGid(asanaUrl);
      if (!projectGid) return [];
      return withFailSafe(`getTasksForProject(${projectGid})`, () =>
        asanaGetAllPages(
          `/projects/${projectGid}/tasks?opt_fields=name,completed,due_on,notes,memberships.section.name,custom_fields&limit=100`,
        ),
      );
    };

    for (const contact of contacts || []) {
      try {
        const tasks = await rootTasksFor(contact.asana_url);
        for (const task of tasks || []) {
          // Skip entirely (no further Asana calls) if this root task was
          // already fully imported in a prior run -- its subtasks/comments
          // were already fetched in that same pass.
          const { data: existingRoot } = await admin
            .from("pm_tasks")
            .select("id")
            .eq("asana_gid", task.gid)
            .eq("contact_id", contact.id)
            .maybeSingle();
          if (existingRoot) {
            summary.skippedExisting++;
            continue;
          }

          const pmTaskId = await importTask(task, contact.id, contact.household_id, null);

          const subtasks = await withFailSafe(`getSubtasks(${task.gid})`, () =>
            asanaGetAllPages(
              `/tasks/${task.gid}/subtasks?opt_fields=name,completed,due_on,notes,memberships.section.name,custom_fields&limit=100`,
            ),
          );
          for (const subtask of subtasks || []) {
            await importTask(subtask, contact.id, contact.household_id, pmTaskId);
          }
        }
        summary.contactsProcessed++;
      } catch (e) {
        summary.errors.push({ contactId: contact.id, message: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({ ok: true, summary });
  } catch (e) {
    console.error("asana-pm-backfill error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
