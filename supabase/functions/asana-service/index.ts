import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const ASANA_BASE_URL = "https://app.asana.com/api/1.0";

// ---------------------------------------------------------------------------
// Fail-safe wrapper with exponential backoff
// ---------------------------------------------------------------------------
async function withFailSafe<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`[AsanaService] ${label} failed after ${maxRetries} attempts:`, err);
        throw err;
      }
      const backoffMs = Math.min(1000 * 2 ** attempt, 16000);
      console.warn(
        `[AsanaService] ${label} attempt ${attempt} failed, retrying in ${backoffMs}ms...`,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: Extract Asana project GID from an asana_url
// e.g. https://app.asana.com/0/1234567890/list → "1234567890"
// ---------------------------------------------------------------------------
function extractProjectGid(asanaUrl: string | null): string | null {
  if (!asanaUrl) return null;
  // New format: /1/WORKSPACE/project/PROJECT_GID/...
  const newMatch = asanaUrl.match(/\/project\/(\d+)/);
  if (newMatch) return newMatch[1];
  // Old format: /0/PROJECT_GID
  const oldMatch = asanaUrl.match(/app\.asana\.com\/0\/(\d+)/);
  return oldMatch ? oldMatch[1] : null;
}

// ---------------------------------------------------------------------------
// Helper: Extract Asana task GID from a task URL
// Supports:
//   https://app.asana.com/0/PROJECT_GID/TASK_GID       → TASK_GID
//   https://app.asana.com/0/PROJECT_GID/TASK_GID/f     → TASK_GID
//   https://app.asana.com/0/TASK_GID/f                 → TASK_GID
// ---------------------------------------------------------------------------
function extractTaskGid(asanaUrl: string | null): string | null {
  if (!asanaUrl) return null;
  // New format: /task/TASK_GID
  const newTaskMatch = asanaUrl.match(/\/task\/(\d+)/);
  if (newTaskMatch) return newTaskMatch[1];
  // New format: /project/PROJECT/list/TASK_GID (task selected in list view)
  const listTaskMatch = asanaUrl.match(/\/project\/\d+\/list\/(\d+)/);
  if (listTaskMatch) return listTaskMatch[1];
  // Old format: /0/SOMETHING/TASK_GID or /0/SOMETHING/TASK_GID/f
  const twoSegment = asanaUrl.match(/app\.asana\.com\/0\/\d+\/(\d+)/);
  if (twoSegment) return twoSegment[1];
  // Old format: /0/TASK_GID/f (single segment with /f suffix)
  const singleSegment = asanaUrl.match(/app\.asana\.com\/0\/(\d+)\/f/);
  if (singleSegment) return singleSegment[1];
  return null;
}

// ---------------------------------------------------------------------------
// Helper: Determine if the asana_url points to a task vs a project
// Task URLs have a second numeric segment or end in /f
// Project URLs end in /list, /board, /timeline, or have only one segment
// ---------------------------------------------------------------------------
function isTaskUrl(asanaUrl: string | null): boolean {
  if (!asanaUrl) return false;
  // New format: /task/TASK_GID
  if (/\/task\/\d+/.test(asanaUrl)) return true;
  // New format: /project/PROJECT/list/TASK_GID (task selected in list view)
  if (/\/project\/\d+\/list\/\d+/.test(asanaUrl)) return true;
  // Old format: /0/TASK_GID/f
  if (/app\.asana\.com\/0\/\d+\/f/.test(asanaUrl)) return true;
  // Old format: /0/PROJECT_GID/TASK_GID (two numeric segments, not a view suffix)
  if (/app\.asana\.com\/0\/\d+\/\d+/.test(asanaUrl) && !/\/(list|board|timeline|calendar)/.test(asanaUrl)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// AsanaService – centralised module for Asana API communication
// ---------------------------------------------------------------------------
class AsanaService {
  private token: string;
  private workspaceId: string;
  private projectTemplateId: string;

  constructor() {
    const token = Deno.env.get("ASANA_ACCESS_TOKEN");
    if (!token) throw new Error("ASANA_ACCESS_TOKEN is not configured");

    const workspaceId = Deno.env.get("ASANA_WORKSPACE_ID");
    if (!workspaceId) throw new Error("ASANA_WORKSPACE_ID is not configured");

    const projectTemplateId = Deno.env.get("ASANA_PROJECT_TEMPLATE_ID");
    if (!projectTemplateId) throw new Error("ASANA_PROJECT_TEMPLATE_ID is not configured");

    this.token = token;
    this.workspaceId = workspaceId;
    this.projectTemplateId = projectTemplateId;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  // -------------------------------------------------------------------------
  // createTask – LIVE: Create a task in a project
  // -------------------------------------------------------------------------
  async createTask(payload: {
    name: string;
    notes?: string;
    due_on?: string | null;
    projects?: string[];
    assignee?: string | null;
    custom_fields?: Record<string, string>;
  }) {
    return withFailSafe("createTask", async () => {
      const url = `${ASANA_BASE_URL}/tasks`;
      const data: any = { name: payload.name };
      if (payload.notes) data.notes = payload.notes;
      if (payload.due_on) data.due_on = payload.due_on;
      if (payload.projects) data.projects = payload.projects;
      if (payload.assignee) data.assignee = payload.assignee;
      if (payload.custom_fields) data.custom_fields = payload.custom_fields;

      console.log("[AsanaService] POST", url, JSON.stringify(data));
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ data }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      const task = json.data;

      // Verify custom_fields were set
      if (payload.custom_fields && task?.gid) {
        const verifyCf = task.custom_fields || [];
        const visField = verifyCf.find((cf: any) => 
          cf.name === "PW_Visibility" || cf.name?.toLowerCase().includes("visibility")
        );
        console.log("[AsanaService] createTask visibility after creation:", visField?.enum_value?.name || "NOT SET");
      }

      return task;
    });
  }

  // -------------------------------------------------------------------------
  // createSubtask – LIVE: Create a subtask under a parent task
  // Custom fields must be set via a separate PUT after creation because
  // subtasks don't inherit the parent project's custom field settings.
  // -------------------------------------------------------------------------
  async createSubtask(parentTaskGid: string, payload: {
    name: string;
    notes?: string;
    due_on?: string | null;
    assignee?: string | null;
    custom_fields?: Record<string, string>;
    project_gid?: string;
  }) {
    return withFailSafe("createSubtask", async () => {
      const url = `${ASANA_BASE_URL}/tasks/${parentTaskGid}/subtasks`;
      const data: any = { name: payload.name };
      if (payload.notes) data.notes = payload.notes;
      if (payload.due_on) data.due_on = payload.due_on;
      if (payload.assignee) data.assignee = payload.assignee;
      // Do NOT include custom_fields on subtask creation – they aren't on the subtask object yet

      console.log("[AsanaService] POST subtask", url, JSON.stringify(data));
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ data }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      const subtask = json.data;

      // If custom_fields were requested, add the subtask to the parent's project first,
      // then set the custom field value via PUT
      if (payload.custom_fields && subtask?.gid) {
        console.log("[AsanaService] Setting custom_fields on subtask", subtask.gid, JSON.stringify(payload.custom_fields));

        // Find project to add subtask to — prefer explicit project_gid, then parent's project
        let projectGid = payload.project_gid || null;
        let projectAdded = false;

        if (!projectGid) {
          const parentRes = await fetch(
            `${ASANA_BASE_URL}/tasks/${parentTaskGid}?opt_fields=memberships.project.gid,memberships.section.gid`,
            { headers: this.headers() },
          );
          if (parentRes.ok) {
            const parentJson = await parentRes.json();
            const memberships = parentJson.data?.memberships || [];
            projectGid = memberships.find((m: any) => m?.project?.gid)?.project?.gid || null;
            console.log("[AsanaService] Parent task memberships:", JSON.stringify(memberships));
          } else {
            console.warn("[AsanaService] Failed to fetch parent task projects:", parentRes.status);
          }
        } else {
          console.log("[AsanaService] Using explicit project_gid:", projectGid);
        }

        if (projectGid) {
          // Add subtask to the same project so custom fields are available
          const addProjRes = await fetch(`${ASANA_BASE_URL}/tasks/${subtask.gid}/addProject`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ data: { project: projectGid } }),
          });
          if (addProjRes.ok) {
            projectAdded = true;
            console.log("[AsanaService] Subtask added to project", projectGid);
          } else {
            const addProjBody = await addProjRes.text();
            console.warn("[AsanaService] Failed to add subtask to project:", addProjBody);
          }
        } else {
          console.warn("[AsanaService] No project found, cannot add custom fields via project");
        }

        // Try setting custom fields regardless — works if field is workspace-level
        // or if addProject succeeded
        const cfRes = await fetch(`${ASANA_BASE_URL}/tasks/${subtask.gid}`, {
          method: "PUT",
          headers: this.headers(),
          body: JSON.stringify({ data: { custom_fields: payload.custom_fields } }),
        });
        if (!cfRes.ok) {
          const cfBody = await cfRes.text();
          console.warn("[AsanaService] Failed to set custom fields on subtask:", cfBody);
          
          // If project wasn't added and direct PUT failed, try finding any project
          // from the workspace that has this custom field
          if (!projectAdded) {
            console.warn("[AsanaService] Custom fields could not be set — subtask may not be in a project with PW_Visibility field");
          }
        } else {
          console.log("[AsanaService] Custom fields set successfully on subtask", subtask.gid);
        }
      }

      return subtask;
    });
  }

  // -------------------------------------------------------------------------
  // lookupVisibilityField – Find PW_Visibility custom field GID and enum options
  // by inspecting a task's custom_fields
  // -------------------------------------------------------------------------
  async lookupVisibilityField(taskGid: string): Promise<{
    fieldGid: string;
    internalOnlyGid: string;
    clientVisibleGid: string;
  } | null> {
    return withFailSafe("lookupVisibilityField", async () => {
      const url = `${ASANA_BASE_URL}/tasks/${taskGid}?opt_fields=custom_fields`;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) return null;
      const json = await res.json();
      const cfs = json.data?.custom_fields || [];
      const visField = cfs.find(
        (cf: any) => cf.name === "PW_Visibility" || cf.name?.toLowerCase().includes("visibility"),
      );
      if (!visField || !visField.enum_options) return null;
      const internalOpt = visField.enum_options.find((o: any) => o.name === "Internal Only");
      const clientOpt = visField.enum_options.find((o: any) => o.name === "Client Visible");
      if (!internalOpt || !clientOpt) return null;
      return {
        fieldGid: visField.gid,
        internalOnlyGid: internalOpt.gid,
        clientVisibleGid: clientOpt.gid,
      };
    });
  }

  // -------------------------------------------------------------------------
  // updateTask – LIVE: Update task fields (name, notes, due_on, completed, assignee)
  // -------------------------------------------------------------------------
  async updateTask(taskGid: string, updates: {
    name?: string;
    notes?: string;
    due_on?: string | null;
    completed?: boolean;
    assignee?: string | null;
    custom_fields?: Record<string, string>;
  }) {
    return withFailSafe("updateTask", async () => {
      const url = `${ASANA_BASE_URL}/tasks/${taskGid}`;
      console.log("[AsanaService] PUT", url, JSON.stringify(updates));

      const res = await fetch(url, {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({ data: updates }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      return json.data;
    });
  }

  // -------------------------------------------------------------------------
  // getWorkspaceUsers – LIVE: Fetch users in the workspace for assignee picker
  // -------------------------------------------------------------------------
  async getWorkspaceUsers() {
    return withFailSafe("getWorkspaceUsers", async () => {
      const url = `${ASANA_BASE_URL}/workspaces/${this.workspaceId}/users?opt_fields=name,email,photo.image_36x36&limit=100`;
      console.log("[AsanaService] GET", url);
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        const body = await res.text();
        console.error("[AsanaService] getWorkspaceUsers failed:", res.status, body);
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      const allUsers = json.data || [];
      console.log("[AsanaService] getWorkspaceUsers total:", allUsers.length);
      // Filter to only @prosperwise.ca team members
      const filtered = allUsers.filter((u: any) => 
        u.email && u.email.toLowerCase().endsWith("@prosperwise.ca")
      );
      console.log("[AsanaService] getWorkspaceUsers filtered:", filtered.length);
      return filtered;
    });
  }

  // -------------------------------------------------------------------------
  // getProjectStatus – PLACEHOLDER (no live API call)
  // -------------------------------------------------------------------------
  async getProjectStatus(payload: { project_gid: string }) {
    return withFailSafe("getProjectStatus", async () => {
      console.log("[AsanaService] getProjectStatus called with:", JSON.stringify(payload));
      return {
        status: "Infrastructure Ready",
        method: "getProjectStatus",
        payload_received: payload,
      };
    });
  }

  // -------------------------------------------------------------------------
  // getProjectMembers – LIVE: Fetch members of an Asana project
  // -------------------------------------------------------------------------
  async getProjectMembers(projectGid: string) {
    return withFailSafe("getProjectMembers", async () => {
      const url = `${ASANA_BASE_URL}/projects/${projectGid}/members?opt_fields=name,email`;
      console.log("[AsanaService] GET", url);

      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      return json.data || [];
    });
  }

  // -------------------------------------------------------------------------
  // getTasksForProject – LIVE: Fetch tasks from an Asana project
  // -------------------------------------------------------------------------
  async getTasksForProject(projectGid: string) {
    return withFailSafe("getTasksForProject", async () => {
      const url = `${ASANA_BASE_URL}/projects/${projectGid}/tasks?opt_fields=name,completed,due_on,assignee.name,assignee.gid,assignee_status,custom_fields,memberships.section.name,followers,notes,parent.gid&limit=100`;
      console.log("[AsanaService] GET", url);

      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      const tasks = json.data || [];
      return tasks.filter((task: any) => !task.parent?.gid);
    });
  }

  // -------------------------------------------------------------------------
  // getTaskStories – LIVE: Fetch comments/stories for a task
  // -------------------------------------------------------------------------
  async getTaskStories(taskGid: string) {
    return withFailSafe("getTaskStories", async () => {
      const url = `${ASANA_BASE_URL}/tasks/${taskGid}/stories?opt_fields=text,created_by.name,created_at,type,resource_subtype`;
      console.log("[AsanaService] GET", url);

      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      // Only return comment-type stories
      return (json.data || []).filter(
        (s: any) => s.resource_subtype === "comment_added",
      );
    });
  }

  // -------------------------------------------------------------------------
  // postTaskComment – LIVE: Post a comment to an Asana task
  // -------------------------------------------------------------------------
  async postTaskComment(taskGid: string, text: string) {
    return withFailSafe("postTaskComment", async () => {
      const url = `${ASANA_BASE_URL}/tasks/${taskGid}/stories`;
      console.log("[AsanaService] POST comment to", url);

      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ data: { text } }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      return await res.json();
    });
  }

  // -------------------------------------------------------------------------
  // getDashboardTasks – LIVE: Fetch tasks from workspace where user is assignee/follower
  // Uses workspace-level task search with due_on = today
  // -------------------------------------------------------------------------
  async getDashboardTasks() {
    return withFailSafe("getDashboardTasks", async () => {
      const today = new Date().toISOString().split("T")[0];
      const url = `${ASANA_BASE_URL}/workspaces/${this.workspaceId}/tasks/search?opt_fields=name,completed,due_on,memberships.section.name,memberships.project.gid,followers,notes&due_on.before=${today}&due_on.after=2000-01-01&is_subtask=false&completed=false&limit=50`;
      console.log("[AsanaService] GET dashboard tasks");

      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      return json.data || [];
    });
  }

  // -------------------------------------------------------------------------
  // getInbox – LIVE: Fetch all tasks assigned to OR followed by the user
  // Merges both sets, deduplicates, and sorts by modified_at descending
  // -------------------------------------------------------------------------
  async getInbox() {
    return withFailSafe("getInbox", async () => {
      const fields = "name,completed,due_on,modified_at,memberships.section.name,memberships.project.gid,notes,num_subtasks";

      // Two parallel searches: assigned to me + followed by me
      const assignedUrl = `${ASANA_BASE_URL}/workspaces/${this.workspaceId}/tasks/search?opt_fields=${fields}&assignee.any=me&is_subtask=false&completed=false&sort_by=modified_at&sort_ascending=false&limit=50`;
      const followedUrl = `${ASANA_BASE_URL}/workspaces/${this.workspaceId}/tasks/search?opt_fields=${fields}&followers.any=me&is_subtask=false&completed=false&sort_by=modified_at&sort_ascending=false&limit=50`;

      console.log("[AsanaService] GET inbox (assigned + followed)");

      const [assignedRes, followedRes] = await Promise.all([
        fetch(assignedUrl, { headers: this.headers() }),
        fetch(followedUrl, { headers: this.headers() }),
      ]);

      if (!assignedRes.ok) {
        const body = await assignedRes.text();
        throw new Error(`Asana API error (assigned) ${assignedRes.status}: ${body}`);
      }
      if (!followedRes.ok) {
        const body = await followedRes.text();
        throw new Error(`Asana API error (followed) ${followedRes.status}: ${body}`);
      }

      const [assignedJson, followedJson] = await Promise.all([
        assignedRes.json(),
        followedRes.json(),
      ]);

      // Merge & deduplicate by GID
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const task of [...(assignedJson.data || []), ...(followedJson.data || [])]) {
        if (!seen.has(task.gid)) {
          seen.add(task.gid);
          merged.push(task);
        }
      }

      // Sort by modified_at descending
      merged.sort((a, b) => {
        const da = a.modified_at ? new Date(a.modified_at).getTime() : 0;
        const db = b.modified_at ? new Date(b.modified_at).getTime() : 0;
        return db - da;
      });

      return merged.slice(0, 50);
    });
  }

  // -------------------------------------------------------------------------
  // getMyTasks – Tasks assigned to staff in linked projects (excludes collaborator-only)
  // -------------------------------------------------------------------------
  async getMyTasks(projectGids?: string[]) {
    return withFailSafe("getMyTasks", async () => {
      const fields = "name,completed,due_on,modified_at,memberships.section.name,memberships.project.gid,notes,num_subtasks,assignee.name,parent.gid";
      
      const fetches: Promise<Response>[] = [];

      // Fetch tasks assigned to me (the PAT user)
      let assignedUrl = `${ASANA_BASE_URL}/workspaces/${this.workspaceId}/tasks/search?opt_fields=${fields}&assignee.any=me&is_subtask=false&completed=false&sort_by=modified_at&sort_ascending=false&limit=50`;
      if (projectGids && projectGids.length > 0) {
        assignedUrl += `&projects.any=${projectGids.join(",")}`;
      }
      fetches.push(fetch(assignedUrl, { headers: this.headers() }));

      // Fetch ALL tasks from linked projects (any assignee) — but only assigned tasks show up here
      if (projectGids && projectGids.length > 0) {
        const projectAllUrl = `${ASANA_BASE_URL}/workspaces/${this.workspaceId}/tasks/search?opt_fields=${fields}&projects.any=${projectGids.join(",")}&is_subtask=false&completed=false&sort_by=modified_at&sort_ascending=false&limit=50`;
        fetches.push(fetch(projectAllUrl, { headers: this.headers() }));
      }

      console.log("[AsanaService] GET my tasks (assigned + project-wide, no collaborator)");

      const responses = await Promise.all(fetches);

      for (const res of responses) {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Asana API error ${res.status}: ${body}`);
        }
      }

      const jsons = await Promise.all(responses.map(r => r.json()));

      // Merge & deduplicate by GID, only include tasks that have an assignee
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const json of jsons) {
        for (const task of (json.data || [])) {
          if (!seen.has(task.gid) && task.assignee && !task.parent?.gid) {
            seen.add(task.gid);
            merged.push(task);
          }
        }
      }

      merged.sort((a: any, b: any) => {
        const da = a.modified_at ? new Date(a.modified_at).getTime() : 0;
        const db = b.modified_at ? new Date(b.modified_at).getTime() : 0;
        return db - da;
      });

      return merged.slice(0, 50);
    });
  }

  // -------------------------------------------------------------------------
  // getTaskDetail – LIVE: Fetch a single task with full details
  // -------------------------------------------------------------------------
  async getTaskDetail(taskGid: string) {
    return withFailSafe("getTaskDetail", async () => {
      const url = `${ASANA_BASE_URL}/tasks/${taskGid}?opt_fields=name,completed,due_on,notes,memberships.section.name,custom_fields,assignee.name`;
      console.log("[AsanaService] GET task detail", url);

      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      return json.data;
    });
  }

  // -------------------------------------------------------------------------
  // getSubtasks – LIVE: Fetch subtasks of a parent task
  // -------------------------------------------------------------------------
  async getSubtasks(taskGid: string) {
    return withFailSafe("getSubtasks", async () => {
      const url = `${ASANA_BASE_URL}/tasks/${taskGid}/subtasks?opt_fields=name,completed,due_on,notes,memberships.section.name,custom_fields,assignee.name&limit=100`;
      console.log("[AsanaService] GET subtasks for", taskGid);

      const res = await fetch(url, { headers: this.headers() });
      if (res.status === 404) {
        console.warn(`[AsanaService] Parent task ${taskGid} not found (404), returning empty subtasks`);
        await res.text(); // consume body
        return [];
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asana API error ${res.status}: ${body}`);
      }
      const json = await res.json();
      return json.data || [];
    });
  }

  // -------------------------------------------------------------------------
  // verifyTaskBelongsToProject – Privacy guardrail
  // Checks the task itself, then walks up parent chain (max 3 levels)
  // -------------------------------------------------------------------------
  async verifyTaskBelongsToProject(taskGid: string, projectGid: string): Promise<boolean> {
    return withFailSafe("verifyTaskBelongsToProject", async () => {
      let currentGid: string | null = taskGid;
      for (let depth = 0; depth < 4 && currentGid; depth++) {
        const url: string = `${ASANA_BASE_URL}/tasks/${currentGid}?opt_fields=memberships.project.gid,parent.gid`;
        const res: Response = await fetch(url, { headers: this.headers() });
        if (!res.ok) return false;
        const json: any = await res.json();
        const memberships = json.data?.memberships || [];
        if (memberships.some((m: any) => m.project?.gid === projectGid)) return true;
        currentGid = json.data?.parent?.gid || null;
      }
      return false;
    });
  }

  // -------------------------------------------------------------------------
  // addFollowers – Add collaborators/followers to a task
  // -------------------------------------------------------------------------
  async addFollowers(taskGid: string, followerGids: string[]) {
    return withFailSafe("addFollowers", async () => {
      const url = `${ASANA_BASE_URL}/tasks/${taskGid}/addFollowers`;
      console.log("[AsanaService] POST addFollowers", taskGid, followerGids);
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ data: { followers: followerGids } }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.warn(`[AsanaService] addFollowers warning: ${body}`);
        // Non-fatal: Asana follower GIDs may not match contact IDs
      }
      return { ok: true };
    });
  }

  // -------------------------------------------------------------------------
  // verifyTaskIsSubtaskOf – Privacy guardrail for task-based access
  // Walks up the parent chain (max 3 levels) to verify ancestry.
  // -------------------------------------------------------------------------
  async verifyTaskIsSubtaskOf(taskGid: string, parentTaskGid: string): Promise<boolean> {
    return withFailSafe("verifyTaskIsSubtaskOf", async () => {
      if (taskGid === parentTaskGid) return true;
      // Walk up the parent chain (supports subtasks and sub-subtasks)
      let currentGid = taskGid;
      for (let depth = 0; depth < 3; depth++) {
        const url = `${ASANA_BASE_URL}/tasks/${currentGid}?opt_fields=parent.gid`;
        const res = await fetch(url, { headers: this.headers() });
        if (!res.ok) return false;
        const json = await res.json();
        const parentGid = json.data?.parent?.gid;
        if (!parentGid) return false;
        if (parentGid === parentTaskGid) return true;
        currentGid = parentGid;
      }
      return false;
    });
  }
}

// ---------------------------------------------------------------------------
// Portal token validation helper
// ---------------------------------------------------------------------------
async function validatePortalToken(
  portalToken: string,
): Promise<{ contactId: string; asanaProjectGid: string | null; asanaTaskGid: string | null; isTaskBased: boolean } | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tokenData, error } = await supabase
    .from("portal_tokens")
    .select("contact_id, expires_at, revoked")
    .eq("token", portalToken)
    .eq("revoked", false)
    .maybeSingle();

  if (error || !tokenData) return null;
  if (new Date(tokenData.expires_at) < new Date()) return null;

  // Get the contact's asana_url
  const { data: contact } = await supabase
    .from("contacts")
    .select("asana_url")
    .eq("id", tokenData.contact_id)
    .maybeSingle();

  const asanaUrl = contact?.asana_url || null;
  const taskBased = isTaskUrl(asanaUrl);

  return {
    contactId: tokenData.contact_id,
    asanaProjectGid: taskBased ? null : extractProjectGid(asanaUrl),
    asanaTaskGid: taskBased ? extractTaskGid(asanaUrl) : null,
    isTaskBased: taskBased,
  };
}

// ---------------------------------------------------------------------------
// Edge function handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, portal_token, ...params } = body;

    // ---- Auth: either Supabase Bearer or portal_token ----
    let portalContext: { contactId: string; asanaProjectGid: string | null; asanaTaskGid: string | null; isTaskBased: boolean } | null = null;

    if (portal_token) {
      portalContext = await validatePortalToken(portal_token);
      if (!portalContext) {
        return new Response(JSON.stringify({ error: "Invalid or expired portal token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Supabase auth path
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Domain verification: only @prosperwise.ca staff can use this service
      if (!user.email?.toLowerCase().endsWith("@prosperwise.ca")) {
        console.warn(`[AsanaService] Domain check failed for ${user.email}`);
        return new Response(JSON.stringify({ error: "Access denied: unauthorized domain" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const service = new AsanaService();
    let result: unknown;

    switch (action) {
      case "createTask": {
        const { name, notes, due_on, project_gid, assignee, custom_fields } = params;
        if (!name) {
          return new Response(
            JSON.stringify({ error: "name is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await service.createTask({
          name,
          notes,
          due_on,
          projects: project_gid ? [project_gid] : undefined,
          assignee,
          custom_fields,
        });
        break;
      }

      case "createSubtask": {
        const { parent_task_gid, name: subtaskName, notes: subtaskNotes, due_on: subtaskDueOn, assignee: subtaskAssignee, custom_fields: subtaskCf, project_gid: subtaskProjectGid } = params;
        if (!parent_task_gid || !subtaskName) {
          return new Response(
            JSON.stringify({ error: "parent_task_gid and name are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await service.createSubtask(parent_task_gid, {
          name: subtaskName,
          notes: subtaskNotes,
          due_on: subtaskDueOn,
          assignee: subtaskAssignee,
          custom_fields: subtaskCf,
          project_gid: subtaskProjectGid,
        });
        break;
      }

      case "lookupVisibilityField": {
        const { task_gid: lookupTaskGid } = params;
        if (!lookupTaskGid) {
          return new Response(
            JSON.stringify({ error: "task_gid is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await service.lookupVisibilityField(lookupTaskGid);
        break;
      }

      case "getSubtasks": {
        const { task_gid: subtaskParentGid } = params;
        if (!subtaskParentGid) {
          return new Response(
            JSON.stringify({ error: "task_gid is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await service.getSubtasks(subtaskParentGid);
        break;
      }

      case "getProjectStatus":
        result = await service.getProjectStatus(params as any);
        break;

      case "getProject": {
        const { project_gid: gpProjectGid } = params;
        if (!gpProjectGid) {
          return new Response(
            JSON.stringify({ error: "project_gid is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const r = await fetch(
          `https://app.asana.com/api/1.0/projects/${gpProjectGid}?opt_fields=name`,
          { headers: { Authorization: `Bearer ${Deno.env.get("ASANA_ACCESS_TOKEN")}` } },
        );
        const j = await r.json();
        result = j.data || {};
        break;
      }

      case "getTasksForProject": {
        // Helper: filter to client-visible tasks
        const filterVisible = (tasks: any[]) =>
          tasks.filter((task: any) => {
            const customFields = task.custom_fields || [];
            return customFields.some(
              (cf: any) =>
                (cf.name === "PW_Visibility" || cf.name?.toLowerCase().includes("visibility")) &&
                cf.enum_value?.name === "Client Visible",
            );
          });

        // Helper: fetch tagged tasks for a contact and merge
        const fetchTaggedTasks = async (contactId: string) => {
          const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );
          const { data: tagged } = await supabaseAdmin
            .from("task_collaborators")
            .select("task_gid")
            .eq("contact_id", contactId);
          const gids = (tagged || []).map((r: any) => r.task_gid);
          if (gids.length === 0) return [];
          const details = await Promise.all(
            gids.slice(0, 20).map(async (gid: string) => {
              try { return await service.getTaskDetail(gid); } catch { return null; }
            }),
          );
          return details.filter(Boolean);
        };

        // Task-based portal path: fetch parent task + subtasks
        if (portalContext?.isTaskBased && portalContext.asanaTaskGid) {
          const parentTaskGid = portalContext.asanaTaskGid;
          const [parentTask, subtasks] = await Promise.all([
            service.getTaskDetail(parentTaskGid),
            service.getSubtasks(parentTaskGid),
          ]);

          const allTasks = [parentTask, ...subtasks].filter(Boolean);
          let visibleTasks = filterVisible(allTasks);

          // Merge tagged tasks
          const taggedTasks = await fetchTaggedTasks(portalContext.contactId);
          const taggedVisible = filterVisible(taggedTasks);
          const seenGids = new Set(visibleTasks.map((t: any) => t.gid));
          for (const t of taggedVisible) {
            if (!seenGids.has(t.gid)) {
              visibleTasks.push(t);
              seenGids.add(t.gid);
            }
          }

          result = visibleTasks;
          break;
        }

        // Project-based path
        const projectGid = portalContext?.asanaProjectGid || params.project_gid;
        if (!projectGid) {
          return new Response(
            JSON.stringify({ error: "No Asana project configured for this contact" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const allTasks = await service.getTasksForProject(projectGid);

        if (portalContext) {
          let visibleTasks = filterVisible(allTasks as any[]);

          // Merge tagged tasks
          const taggedTasks = await fetchTaggedTasks(portalContext.contactId);
          const taggedVisible = filterVisible(taggedTasks);
          const seenGids = new Set(visibleTasks.map((t: any) => t.gid));
          for (const t of taggedVisible) {
            if (!seenGids.has(t.gid)) {
              visibleTasks.push(t);
              seenGids.add(t.gid);
            }
          }

          result = visibleTasks;
        } else {
          result = allTasks;
        }
        break;
      }

      case "getProjectMembers": {
        const pmProjectGid = portalContext?.asanaProjectGid || params.project_gid;
        if (!pmProjectGid) {
          return new Response(
            JSON.stringify({ error: "project_gid is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await service.getProjectMembers(pmProjectGid);
        break;
      }

      case "getTaskStories": {
        const { task_gid } = params;
        if (!task_gid) {
          return new Response(
            JSON.stringify({ error: "task_gid is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Privacy guardrail: if portal, verify task access
        if (portalContext) {
          let hasAccess = false;
          if (portalContext.isTaskBased && portalContext.asanaTaskGid) {
            hasAccess = await service.verifyTaskIsSubtaskOf(task_gid, portalContext.asanaTaskGid);
          } else if (portalContext.asanaProjectGid) {
            hasAccess = await service.verifyTaskBelongsToProject(task_gid, portalContext.asanaProjectGid);
          }
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ error: "Access denied" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
        result = await service.getTaskStories(task_gid);
        break;
      }

      case "postTaskComment": {
        const { task_gid: tGid, text } = params;
        if (!tGid || !text) {
          return new Response(
            JSON.stringify({ error: "task_gid and text are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Privacy guardrail
        if (portalContext) {
          let hasAccess = false;
          if (portalContext.isTaskBased && portalContext.asanaTaskGid) {
            hasAccess = await service.verifyTaskIsSubtaskOf(tGid, portalContext.asanaTaskGid);
          } else if (portalContext.asanaProjectGid) {
            hasAccess = await service.verifyTaskBelongsToProject(tGid, portalContext.asanaProjectGid);
          }
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ error: "Access denied" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
        // If portal user, prefix the comment with their name so it's identifiable
        let commentText = text;
        if (portalContext) {
          const supabaseAdmin0 = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );
          const { data: cd } = await supabaseAdmin0
            .from("contacts")
            .select("full_name")
            .eq("id", portalContext.contactId)
            .maybeSingle();
          const cName = cd?.full_name || "Client";
          commentText = `[${cName}]: ${text}`;
        }
        result = await service.postTaskComment(tGid, commentText);

        // If portal user posted a comment, create in-app notification for staff
        if (portalContext) {
          try {
            const supabaseAdmin = createClient(
              Deno.env.get("SUPABASE_URL")!,
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            );
            // Get contact name
            const { data: contactData } = await supabaseAdmin
              .from("contacts")
              .select("full_name")
              .eq("id", portalContext.contactId)
              .maybeSingle();
            // Get task name
            let taskName = tGid;
            try {
              const taskDetail = await service.getTaskDetail(tGid);
              taskName = taskDetail?.name || tGid;
            } catch {}

            const contactName = contactData?.full_name || "A client";
            await supabaseAdmin.from("staff_notifications").insert({
              title: `${contactName} commented on "${taskName}"`,
              body: text.length > 100 ? text.substring(0, 100) + "…" : text,
              link: `/contacts/${portalContext.contactId}`,
              contact_id: portalContext.contactId,
              source_type: "task_comment",
            });
          } catch (notifErr) {
            console.error("[AsanaService] Failed to create staff notification:", notifErr);
          }
        }
        break;
      }

      case "getDashboardTasks": {
        result = await service.getDashboardTasks();
        break;
      }

      case "getWorkspaceUsers": {
        result = await service.getWorkspaceUsers();
        break;
      }

      case "getInbox": {
        result = await service.getInbox();
        break;
      }

      case "getMyTasks": {
        const { project_gids } = params;
        result = await service.getMyTasks(project_gids);
        break;
      }

      case "tagCollaborators": {
        // Tag household members and/or professionals on a task: persist to
        // task_collaborators + optionally add as Asana followers.
        const { task_gid: tagTaskGid, contact_ids, professional_ids, asana_follower_gids } = params;
        const contactIdList: string[] = Array.isArray(contact_ids) ? contact_ids : [];
        const professionalIdList: string[] = Array.isArray(professional_ids) ? professional_ids : [];
        if (!tagTaskGid || (contactIdList.length === 0 && professionalIdList.length === 0)) {
          return new Response(
            JSON.stringify({ error: "task_gid and at least one of contact_ids[]/professional_ids[] are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        // Get current user ID from auth header
        const authHeader2 = req.headers.get("Authorization");
        let userId = "system";
        if (authHeader2) {
          const sb2 = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: authHeader2 } } },
          );
          const { data: userData } = await sb2.auth.getUser();
          userId = userData?.user?.id || "system";
        }
        // Upsert into task_collaborators — contact and professional rows use
        // different unique constraints, so they need separate upsert calls.
        if (contactIdList.length > 0) {
          const rows = contactIdList.map((cid: string) => ({
            task_gid: tagTaskGid,
            contact_id: cid,
            tagged_by: userId,
          }));
          const { error: insertErr } = await supabaseAdmin
            .from("task_collaborators")
            .upsert(rows, { onConflict: "task_gid,contact_id" });
          if (insertErr) console.error("[AsanaService] tagCollaborators contact insert error:", insertErr);
        }
        if (professionalIdList.length > 0) {
          const rows = professionalIdList.map((pid: string) => ({
            task_gid: tagTaskGid,
            professional_id: pid,
            tagged_by: userId,
          }));
          const { error: insertErr } = await supabaseAdmin
            .from("task_collaborators")
            .upsert(rows, { onConflict: "task_gid,professional_id" });
          if (insertErr) console.error("[AsanaService] tagCollaborators professional insert error:", insertErr);
        }
        // Optionally add Asana followers
        if (asana_follower_gids && asana_follower_gids.length > 0) {
          await service.addFollowers(tagTaskGid, asana_follower_gids);
        }
        result = { tagged: contactIdList.length + professionalIdList.length };
        break;
      }

      case "untagCollaborator": {
        const { task_gid: untagTaskGid, contact_id: untagContactId, professional_id: untagProfessionalId } = params;
        if (!untagTaskGid || (!untagContactId && !untagProfessionalId)) {
          return new Response(
            JSON.stringify({ error: "task_gid and one of contact_id/professional_id are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const supabaseAdmin2 = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        let del = supabaseAdmin2.from("task_collaborators").delete().eq("task_gid", untagTaskGid);
        del = untagContactId ? del.eq("contact_id", untagContactId) : del.eq("professional_id", untagProfessionalId);
        await del;
        result = { untagged: true };
        break;
      }

      case "getTaggedTasks": {
        // Fetch task GIDs where a contact is tagged, then fetch details from Asana
        const { contact_id: taggedContactId } = params;
        if (!taggedContactId) {
          return new Response(
            JSON.stringify({ error: "contact_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const supabaseAdmin3 = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: tagged } = await supabaseAdmin3
          .from("task_collaborators")
          .select("task_gid")
          .eq("contact_id", taggedContactId);
        const taskGids = (tagged || []).map((r: any) => r.task_gid);
        if (taskGids.length === 0) {
          result = [];
          break;
        }
        // Fetch each task detail in parallel (max 20 to avoid overload)
        const limitedGids = taskGids.slice(0, 20);
        const taskDetails = await Promise.all(
          limitedGids.map(async (gid: string) => {
            try {
              return await service.getTaskDetail(gid);
            } catch {
              return null;
            }
          }),
        );
        result = taskDetails.filter(Boolean);
        break;
      }

      case "getCollaboratorsForTask": {
        const { task_gid: collabTaskGid } = params;
        if (!collabTaskGid) {
          return new Response(
            JSON.stringify({ error: "task_gid is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const supabaseAdmin4 = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: collabs } = await supabaseAdmin4
          .from("task_collaborators")
          .select("contact_id, professional_id")
          .eq("task_gid", collabTaskGid);
        result = {
          contact_ids: (collabs || []).map((r: any) => r.contact_id).filter(Boolean),
          professional_ids: (collabs || []).map((r: any) => r.professional_id).filter(Boolean),
        };
        break;
      }

      case "updateTask": {
        const { task_gid: updateGid, updates } = params;
        if (!updateGid || !updates) {
          return new Response(
            JSON.stringify({ error: "task_gid and updates are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Privacy guardrail for portal users
        if (portalContext) {
          let hasAccess = false;
          if (portalContext.isTaskBased && portalContext.asanaTaskGid) {
            hasAccess = await service.verifyTaskIsSubtaskOf(updateGid, portalContext.asanaTaskGid);
          } else if (portalContext.asanaProjectGid) {
            hasAccess = await service.verifyTaskBelongsToProject(updateGid, portalContext.asanaProjectGid);
          }
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ error: "Access denied" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
        result = await service.updateTask(updateGid, updates);
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    return new Response(JSON.stringify({ data: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[AsanaService] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
