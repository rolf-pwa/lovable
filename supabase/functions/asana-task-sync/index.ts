// Polls Asana for client-visible task activity (new comments, completions,
// reopenings) that happened OUTSIDE the CRM UI, and generates portal
// notifications + email digest items for the client.
//
// Runs on pg_cron every 10 minutes.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASANA_BASE_URL = "https://app.asana.com/api/1.0";
const LOOKBACK_MS = 24 * 60 * 60 * 1000; // first-run window

function extractProjectGid(url: string | null): string | null {
  if (!url) return null;
  const newMatch = url.match(/\/project\/(\d+)/);
  if (newMatch) return newMatch[1];
  const match = url.match(/app\.asana\.com\/(?:0|project)\/(\d+)/);
  return match ? match[1] : null;
}

function extractTaskGid(url: string | null): string | null {
  if (!url) return null;
  const taskMatch = url.match(/\/task\/(\d+)/);
  if (taskMatch) return taskMatch[1];
  const listTaskMatch = url.match(/\/project\/\d+\/list\/(\d+)/);
  if (listTaskMatch) return listTaskMatch[1];
  const twoSegment = url.match(/app\.asana\.com\/0\/\d+\/(\d+)/);
  return twoSegment ? twoSegment[1] : null;
}

function isTaskBasedUrl(url: string | null): boolean {
  if (!url) return false;
  if (/\/task\/\d+/.test(url)) return true;
  if (/\/project\/\d+\/list\/\d+/.test(url)) return true;
  if (/app\.asana\.com\/0\/\d+\/f/.test(url)) return true;
  if (/app\.asana\.com\/0\/\d+\/\d+/.test(url) && !/\/(list|board|timeline|calendar)/.test(url)) return true;
  return false;
}

function isClientVisible(task: any): boolean {
  const fields = task?.custom_fields || [];
  return fields.some(
    (cf: any) =>
      (cf.name === "PW_Visibility" || cf.name?.toLowerCase().includes("visibility")) &&
      cf.enum_value?.name === "Client Visible",
  );
}

async function asanaGet(path: string, token: string): Promise<any[]> {
  const res = await fetch(`${ASANA_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[AsanaSync] Asana ${res.status} on ${path}: ${body.slice(0, 300)}`);
    return [];
  }
  const json = await res.json();
  const data = json.data;
  return Array.isArray(data) ? data : data ? [data] : [];
}

const TASK_FIELDS = "name,completed,completed_at,modified_at,custom_fields";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = Deno.env.get("ASANA_ACCESS_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "ASANA_ACCESS_TOKEN not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const runStart = new Date();
  let contactsScanned = 0;
  let eventsCreated = 0;
  const errors: string[] = [];

  try {
    const { data: contacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id, first_name, full_name, email, email_notifications_enabled, asana_url")
      .not("asana_url", "is", null);

    if (contactsErr) throw contactsErr;

    const { data: states } = await supabase
      .from("asana_sync_state")
      .select("contact_id, last_synced_at");
    const stateMap = new Map<string, string>(
      (states || []).map((s: any) => [s.contact_id, s.last_synced_at]),
    );

    for (const contact of contacts || []) {
      const since = new Date(
        stateMap.get(contact.id) || new Date(runStart.getTime() - LOOKBACK_MS).toISOString(),
      );
      contactsScanned++;

      try {
        // ---- Collect candidate client-visible tasks -------------------------
        let tasks: any[] = [];
        if (isTaskBasedUrl(contact.asana_url)) {
          const parentGid = extractTaskGid(contact.asana_url);
          if (parentGid) {
            const [parent, subtasks] = await Promise.all([
              asanaGet(`/tasks/${parentGid}?opt_fields=${TASK_FIELDS}`, token),
              asanaGet(`/tasks/${parentGid}/subtasks?opt_fields=${TASK_FIELDS}&limit=100`, token),
            ]);
            tasks = [...parent, ...subtasks];
          }
        } else {
          const projectGid = extractProjectGid(contact.asana_url);
          if (projectGid) {
            tasks = await asanaGet(
              `/projects/${projectGid}/tasks?opt_fields=${TASK_FIELDS}&limit=100`,
              token,
            );
          }
        }

        // Tasks the contact is explicitly tagged on
        const { data: tagged } = await supabase
          .from("task_collaborators")
          .select("task_gid")
          .eq("contact_id", contact.id);
        const seen = new Set(tasks.map((t) => t.gid));
        for (const row of (tagged || []).slice(0, 25)) {
          if (seen.has(row.task_gid)) continue;
          const detail = await asanaGet(`/tasks/${row.task_gid}?opt_fields=${TASK_FIELDS}`, token);
          tasks.push(...detail);
          seen.add(row.task_gid);
        }

        const visible = tasks.filter(isClientVisible);

        // ---- Detect events --------------------------------------------------
        type Ev = { key: string; task_name: string; task_event: string };
        const events: Ev[] = [];

        for (const task of visible) {
          const modified = task.modified_at ? new Date(task.modified_at) : null;
          if (!modified || modified <= since) continue;

          if (task.completed && task.completed_at && new Date(task.completed_at) > since) {
            events.push({
              key: `completed:${task.gid}:${task.completed_at}`,
              task_name: task.name,
              task_event: "completed",
            });
          }

          // Comments added in Asana since the last sync
          const stories = await asanaGet(
            `/tasks/${task.gid}/stories?opt_fields=text,type,resource_subtype,created_at,created_by.name`,
            token,
          );
          for (const story of stories) {
            if (story.type !== "comment" && story.resource_subtype !== "comment_added") continue;
            if (!story.created_at || new Date(story.created_at) <= since) continue;
            // Skip comments the client posted from the portal ("[Name]: ..." prefix)
            if (typeof story.text === "string" && /^\[.+?\]:\s/.test(story.text)) continue;
            events.push({
              key: `comment:${story.gid}`,
              task_name: task.name,
              task_event: "comment",
            });
          }
        }

        // ---- Emit notifications (deduped) -----------------------------------
        for (const ev of events) {
          const { error: dupeErr } = await supabase
            .from("asana_sync_events")
            .insert({ event_key: ev.key, contact_id: contact.id });
          if (dupeErr) continue; // already processed

          let title = `Update on: ${ev.task_name}`;
          if (ev.task_event === "comment") title = `New comment on: ${ev.task_name}`;
          else if (ev.task_event === "completed") title = `Action item completed: ${ev.task_name}`;

          await supabase.from("portal_client_notifications").insert({
            contact_id: contact.id,
            title,
            body: ev.task_name,
            source_type: `task_${ev.task_event}`,
            link_tab: "tasks",
          });

          if (contact.email && contact.email_notifications_enabled) {
            await supabase.from("email_digest_queue").insert({
              contact_id: contact.id,
              recipient_email: contact.email.trim().toLowerCase(),
              first_name: contact.first_name || "there",
              task_name: ev.task_name,
              task_event: ev.task_event,
              link_tab: "tasks",
            });
          }

          eventsCreated++;
        }

        await supabase.from("asana_sync_state").upsert(
          {
            contact_id: contact.id,
            last_synced_at: runStart.toISOString(),
            updated_at: runStart.toISOString(),
          },
          { onConflict: "contact_id" },
        );
      } catch (err: any) {
        console.error(`[AsanaSync] Contact ${contact.id} failed:`, err);
        errors.push(`${contact.id}: ${err.message || "unknown"}`);
      }
    }

    console.log(
      `[AsanaSync] Scanned ${contactsScanned} contact(s), created ${eventsCreated} notification(s)`,
    );

    return new Response(
      JSON.stringify({
        contacts_scanned: contactsScanned,
        events_created: eventsCreated,
        errors: errors.length ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[AsanaSync] Fatal:", err);
    return new Response(JSON.stringify({ error: err.message || "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
