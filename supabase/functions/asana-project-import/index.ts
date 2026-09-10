// Staff-triggered, on-demand live Asana project importer. Not a sync, not a
// webhook -- one deliberate run per project/task URL, pulling tasks,
// subtasks, and comments via Asana's REST API and writing them into
// pm_tasks/pm_task_comments. Generalizes the one-time asana-pm-backfill
// (which only ever ran against already-linked contacts) to any URL staff
// pastes in, targeting any (or no) household/contact/family/corporation.
//
// Deliberately staff-JWT-gated only -- no x-internal-secret bypass like
// asana-pm-backfill has, since that tool was a one-time script and this one
// is a permanent staff-UI-driven feature.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://prosperwise-portal.web.app",
  "https://prosperwise.lovable.app",
  "https://app.prosperwise.ca",
  "https://id-preview--339dfc8f-3e82-4b05-8a36-a9f66fc58449.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed =
    ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com")
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ASANA_BASE_URL = "https://app.asana.com/api/1.0";
const ASANA_TOKEN = Deno.env.get("ASANA_ACCESS_TOKEN")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function requireStaff(req: Request): Promise<{ userId: string; error?: undefined } | { error: string }> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return { error: "Missing authorization header" };
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabaseUser.auth.getUser();
  if (error || !data?.user) return { error: "Not authenticated" };
  if (!data.user.email?.endsWith("@prosperwise.ca")) return { error: "Not authorized" };
  return { userId: data.user.id };
}

// --- Asana-calling helpers, copied verbatim from asana-pm-backfill/index.ts
// (this repo's edge functions don't share code across function directories,
// so "copy verbatim" is the established convention, not a shortcut). ---

async function withFailSafe<T>(label: string, fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`[asana-project-import] ${label} failed after ${maxRetries} attempts:`, err);
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

function isClientVisible(task: any): boolean {
  const customFields = task.custom_fields || [];
  return customFields.some(
    (cf: any) =>
      (cf.name === "PW_Visibility" || cf.name?.toLowerCase().includes("visibility")) &&
      cf.enum_value?.name === "Client Visible",
  );
}

const TASK_FIELDS = "name,completed,due_on,notes,memberships.section.name,custom_fields";

function resolveUrl(url: string): { kind: "task" | "project"; gid: string } {
  if (isTaskUrl(url)) {
    const gid = extractTaskGid(url);
    if (!gid) throw new Error("Could not parse a task id from this Asana URL");
    return { kind: "task", gid };
  }
  const gid = extractProjectGid(url);
  if (!gid) throw new Error("Could not parse a project id from this Asana URL");
  return { kind: "project", gid };
}

async function getComments(taskGid: string) {
  const stories = await withFailSafe(`getTaskStories(${taskGid})`, () =>
    asanaGetAllPages(`/tasks/${taskGid}/stories?opt_fields=text,created_by.name,created_at,resource_subtype`),
  );
  return (stories || []).filter(
    (s: any) => (!s.resource_subtype || s.resource_subtype === "comment_added") && s.text?.trim(),
  );
}

async function fetchTaskWithChildren(taskGid: string, known?: any) {
  const task = known || (await withFailSafe(`getTask(${taskGid})`, () => asanaGet(`/tasks/${taskGid}?opt_fields=${TASK_FIELDS}`)));
  const [comments, subtasks] = await Promise.all([
    getComments(taskGid),
    withFailSafe(`getSubtasks(${taskGid})`, () =>
      asanaGetAllPages(`/tasks/${taskGid}/subtasks?opt_fields=${TASK_FIELDS}&limit=100`),
    ),
  ]);
  const subtasksWithComments = await Promise.all(
    (subtasks || []).map(async (st: any) => ({ ...st, comments: await getComments(st.gid) })),
  );
  return { ...task, comments, subtasks: subtasksWithComments };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const auth = await requireStaff(req);
    if (auth.error) return json({ ok: false, error: auth.error }, 401);
    const userId = auth.userId;

    const db = admin();
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "preview") {
      const { url } = body;
      if (!String(url || "").trim()) return json({ ok: false, error: "url is required" }, 400);
      const { kind, gid } = resolveUrl(url);

      if (kind === "task") {
        const task = await withFailSafe(`getTask(${gid})`, () => asanaGet(`/tasks/${gid}?opt_fields=name`));
        return json({ ok: true, kind, name: task.name, topLevelCount: 1 });
      }

      const [project, tasks] = await Promise.all([
        withFailSafe(`getProject(${gid})`, () => asanaGet(`/projects/${gid}?opt_fields=name`)),
        withFailSafe(`getTasksForProject(${gid})`, () =>
          asanaGetAllPages(`/projects/${gid}/tasks?opt_fields=name,parent&limit=100`),
        ),
      ]);
      const topLevel = (tasks || []).filter((t: any) => !t.parent);
      return json({ ok: true, kind, name: project.name, topLevelCount: topLevel.length });
    }

    if (action === "fetch") {
      const { url } = body;
      if (!String(url || "").trim()) return json({ ok: false, error: "url is required" }, 400);
      const { kind, gid } = resolveUrl(url);

      if (kind === "task") {
        const payloadTask = await fetchTaskWithChildren(gid);
        return json({ ok: true, payload: { kind, sourceName: payloadTask.name, tasks: [payloadTask] } });
      }

      const project = await withFailSafe(`getProject(${gid})`, () => asanaGet(`/projects/${gid}?opt_fields=name`));
      const allTasks = await withFailSafe(`getTasksForProject(${gid})`, () =>
        asanaGetAllPages(`/projects/${gid}/tasks?opt_fields=${TASK_FIELDS},parent&limit=100`),
      );
      const rootTasks = (allTasks || []).filter((t: any) => !t.parent);
      const tasks = await Promise.all(rootTasks.map((t: any) => fetchTaskWithChildren(t.gid, t)));
      return json({ ok: true, payload: { kind, sourceName: project.name, tasks } });
    }

    if (action === "commit") {
      const { project_id, household_id, contact_id, corporation_id, family_id, payload } = body;
      if (!project_id) return json({ ok: false, error: "project_id is required" }, 400);
      if (!payload?.tasks) return json({ ok: false, error: "payload.tasks is required" }, 400);
      const linkCount = [household_id, contact_id, corporation_id, family_id].filter(Boolean).length;
      if (linkCount > 1) {
        return json({ ok: false, error: "A project can link to at most one household, contact, corporation, or family" }, 400);
      }

      const summary = {
        tasksImported: 0,
        subtasksImported: 0,
        commentsImported: 0,
        skippedExisting: 0,
        errors: [] as { asana_gid: string; title: string; message: string }[],
      };

      const importComments = async (pmTaskId: string, comments: any[]) => {
        for (const story of comments || []) {
          const when = story.created_at ? new Date(story.created_at).toLocaleDateString("en-US") : "unknown date";
          const author = story.created_by?.name || "Asana";
          const { error } = await db.from("pm_task_comments").insert({
            task_id: pmTaskId,
            body: `[Imported from Asana — originally posted by ${author}, ${when}]\n\n${story.text}`,
          });
          if (!error) summary.commentsImported++;
        }
      };

      const importOneTask = async (task: any, parentTaskId: string | null) => {
        const { data: existing } = await db
          .from("pm_tasks")
          .select("id")
          .eq("asana_gid", task.gid)
          .eq("project_id", project_id)
          .maybeSingle();
        if (existing) {
          summary.skippedExisting++;
          return existing.id;
        }

        const { data: inserted, error } = await db
          .from("pm_tasks")
          .insert({
            project_id,
            parent_task_id: parentTaskId,
            title: task.name,
            description: task.notes || null,
            status: inferStatus(task),
            due_date: task.due_on || null,
            assignee_id: null,
            household_id: household_id || null,
            contact_id: contact_id || null,
            corporation_id: corporation_id || null,
            family_id: family_id || null,
            client_visible: isClientVisible(task),
            asana_gid: task.gid,
            created_by: userId,
          })
          .select("id")
          .maybeSingle();
        if (error || !inserted) throw new Error(error?.message || "Insert failed");

        if (parentTaskId === null) summary.tasksImported++;
        else summary.subtasksImported++;

        await importComments(inserted.id, task.comments);
        return inserted.id;
      };

      for (const task of payload.tasks) {
        try {
          const pmTaskId = await importOneTask(task, null);
          for (const subtask of task.subtasks || []) {
            try {
              await importOneTask(subtask, pmTaskId);
            } catch (e) {
              summary.errors.push({
                asana_gid: subtask.gid,
                title: subtask.name,
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }
        } catch (e) {
          summary.errors.push({ asana_gid: task.gid, title: task.name, message: e instanceof Error ? e.message : String(e) });
        }
      }

      return json({ ok: true, summary });
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("asana-project-import error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
