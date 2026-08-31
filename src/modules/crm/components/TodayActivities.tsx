import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { CheckSquare, Calendar, Pin, Loader2, Pencil, Check, X } from "lucide-react";
import { format, parseISO, isToday, differenceInCalendarDays } from "date-fns";
import { parseLocalDate } from "@/shared/lib/date-utils";
import { supabase } from "@/shared/integrations/supabase/client";
import { useCalendarEvents, useGoogleStatus } from "@/shared/hooks/useGoogle";
import { getTaskAgent } from "@/shared/lib/agents";
import type { PmTask } from "@/shared/lib/agents";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";

const DEFAULT_PINNED_PROJECT_GID = "1214066166978534";
const PINNED_PROJECT_LABEL = "Pinned Project";
const PINNED_PROJECT_STORAGE_KEY = "dashboard.pinnedProjectGid";

function extractProjectGid(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:project\/|\/0\/)(\d+)/);
  return m ? m[1] : null;
}

function TodayTasks() {
  const [tasks, setTasks] = useState<PmTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const all = await getTaskAgent().listTasks({ assignee_id: "me" });
        const todays = all.filter(
          (t) => t.status !== "done" && t.due_date && isToday(parseLocalDate(t.due_date))
        );
        setTasks(todays);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CheckSquare className="h-4 w-4" />
          Today's Tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing due today.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.slice(0, 6).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("open-my-task", { detail: { id: t.id } })
                    );
                  }}
                  className="flex w-full items-start gap-2 text-sm text-foreground rounded-md px-1 py-0.5 -mx-1 hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sanctuary-bronze shrink-0" />
                  <span className="truncate">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TodayEvents() {
  const { data: status } = useGoogleStatus();
  const { timeMin, timeMax } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { timeMin: start.toISOString(), timeMax: end.toISOString() };
  }, []);
  const { data, isLoading } = useCalendarEvents(timeMin, timeMax);

  const events = (data?.items || []).filter((e: any) => e.start?.dateTime || e.start?.date);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Today's Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!status?.connected ? (
          <p className="text-sm text-muted-foreground">Connect Google to view events.</p>
        ) : isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events today.</p>
        ) : (
          <ul className="space-y-2">
            {events.slice(0, 6).map((e: any) => {
              const start = e.start?.dateTime || e.start?.date;
              const startDate = start ? parseISO(start) : null;
              return (
                <li key={e.id}>
                  <a
                    href={e.htmlLink || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 text-sm rounded-md px-1 py-0.5 -mx-1 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-xs text-muted-foreground w-14 shrink-0 mt-0.5">
                      {startDate && e.start?.dateTime
                        ? format(startDate, "h:mm a")
                        : "All day"}
                    </span>
                    <span className="truncate text-foreground">{e.summary}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PinnedProjectTasks() {
  const [projectGid, setProjectGid] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_PINNED_PROJECT_GID;
    return localStorage.getItem(PINNED_PROJECT_STORAGE_KEY) || DEFAULT_PINNED_PROJECT_GID;
  });
  const [tasks, setTasks] = useState<any[]>([]);
  const [projectName, setProjectName] = useState<string>(PINNED_PROJECT_LABEL);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!projectGid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const [tasksRes, projRes] = await Promise.all([
          supabase.functions.invoke("asana-service", {
            body: { action: "getTasksForProject", project_gid: projectGid },
          }),
          supabase.functions.invoke("asana-service", {
            body: { action: "getProject", project_gid: projectGid },
          }),
        ]);
        const all = tasksRes.data?.data || tasksRes.data || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcoming = (Array.isArray(all) ? all : [])
          .filter((t: any) => !t.completed && t.due_on)
          .map((t: any) => ({ ...t, _due: parseLocalDate(t.due_on) }))
          .filter((t: any) => {
            const diff = differenceInCalendarDays(t._due, today);
            return diff >= 0 && diff <= 7;
          })
          .sort((a: any, b: any) => a._due.getTime() - b._due.getTime());
        setTasks(upcoming);
        const name = projRes.data?.data?.name || projRes.data?.name;
        setProjectName(name || PINNED_PROJECT_LABEL);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [projectGid]);

  const saveDraft = () => {
    const gid = extractProjectGid(draft);
    if (!gid) return;
    localStorage.setItem(PINNED_PROJECT_STORAGE_KEY, gid);
    setProjectGid(gid);
    setEditing(false);
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Pin className="h-4 w-4 shrink-0" />
          {editing ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDraft();
                  if (e.key === "Escape") setEditing(false);
                }}
                placeholder="Asana project URL or GID"
                className="h-7 text-xs"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveDraft}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <span className="truncate flex-1">{projectName} — Next 7 Days</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => {
                  setDraft(projectGid);
                  setEditing(true);
                }}
                title="Change pinned project"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!projectGid ? (
          <p className="text-sm text-muted-foreground">No project pinned.</p>
        ) : loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing due in the next 7 days.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.slice(0, 6).map((t) => (
              <li key={t.gid}>
                <a
                  href={t.permalink_url || `https://app.asana.com/0/${projectGid}/${t.gid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-start gap-2 text-sm rounded-md px-1 py-0.5 -mx-1 hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="text-xs text-muted-foreground w-14 shrink-0 mt-0.5">
                    {format(t._due, "MMM d")}
                  </span>
                  <span className="truncate text-foreground">{t.name}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function TodayActivities() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Today</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TodayTasks />
        <TodayEvents />
        <PinnedProjectTasks />
      </div>
    </div>
  );
}
