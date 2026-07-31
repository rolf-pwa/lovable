import { useState, useEffect } from "react";
import { parseLocalDate } from "@/shared/lib/date-utils";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { CheckSquare, Clock, Loader2, AlertCircle, ChevronRight, ChevronDown, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Link } from "react-router-dom";

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  notes: string;
  memberships?: { section?: { name?: string } }[];
  custom_fields?: any[];
  assignee?: { gid: string; name: string } | null;
}

interface Member {
  id: string;
  first_name: string;
  last_name: string | null;
  family_role: string;
  asana_url: string | null;
}

interface Props {
  members: Member[];
}

function getTaskStatus(task: AsanaTask): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  if (task.completed) return { label: "Done", variant: "secondary" };
  const section = task.memberships?.[0]?.section?.name?.toLowerCase() || "";
  if (section.includes("review") || section.includes("awaiting")) return { label: "Awaiting Review", variant: "outline" };
  if (section.includes("progress") || section.includes("doing")) return { label: "In Progress", variant: "default" };
  if (task.due_on && parseLocalDate(task.due_on) < new Date()) return { label: "Overdue", variant: "destructive" };
  return { label: "Open", variant: "outline" };
}

// URL helpers duplicated here to avoid importing from ContactTaskList's internal helpers
function extractProjectGid(url: string | null): string | null {
  if (!url) return null;
  const newMatch = url.match(/\/project\/(\d+)/);
  if (newMatch) return newMatch[1];
  const oldMatch = url.match(/app\.asana\.com\/0\/(\d+)/);
  return oldMatch ? oldMatch[1] : null;
}

function extractTaskGid(url: string | null): string | null {
  if (!url) return null;
  const newTaskMatch = url.match(/\/task\/(\d+)/);
  if (newTaskMatch) return newTaskMatch[1];
  const listTaskMatch = url.match(/\/project\/\d+\/list\/(\d+)/);
  if (listTaskMatch) return listTaskMatch[1];
  const twoSegment = url.match(/app\.asana\.com\/0\/\d+\/(\d+)/);
  if (twoSegment) return twoSegment[1];
  const singleSegment = url.match(/app\.asana\.com\/0\/(\d+)\/f/);
  if (singleSegment) return singleSegment[1];
  return null;
}

function isTaskUrl(url: string | null): boolean {
  if (!url) return false;
  if (/\/task\/\d+/.test(url)) return true;
  if (/\/project\/\d+\/list\/\d+/.test(url)) return true;
  if (/app\.asana\.com\/0\/\d+\/f/.test(url)) return true;
  if (/app\.asana\.com\/0\/\d+\/\d+/.test(url) && !/\/(list|board|timeline|calendar)/.test(url)) return true;
  return false;
}

interface TaskWithOwner extends AsanaTask {
  ownerContactId: string;
  ownerName: string;
}

export function HouseholdTaskRollup({ members }: Props) {
  const [tasks, setTasks] = useState<TaskWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      const membersWithAsana = members.filter((m) => m.asana_url);
      if (membersWithAsana.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const results = await Promise.all(
          membersWithAsana.map(async (member) => {
            const taskBased = isTaskUrl(member.asana_url);
            const body: any = {};

            if (taskBased) {
              const taskGid = extractTaskGid(member.asana_url);
              if (!taskGid) return [];
              body.action = "getSubtasks";
              body.task_gid = taskGid;
            } else {
              const projectGid = extractProjectGid(member.asana_url);
              if (!projectGid) return [];
              body.action = "getTasksForProject";
              body.project_gid = projectGid;
            }

            const res = await supabase.functions.invoke("asana-service", { body });
            if (res.error || res.data?.error) return [];
            const memberTasks: AsanaTask[] = res.data?.data || [];
            return memberTasks.map((t) => ({
              ...t,
              ownerContactId: member.id,
              ownerName: `${member.first_name} ${member.last_name || ""}`.trim(),
            }));
          }),
        );

        // Flatten, deduplicate by GID, sort by due date
        const seen = new Set<string>();
        const merged: TaskWithOwner[] = [];
        for (const batch of results) {
          for (const task of batch) {
            if (!seen.has(task.gid)) {
              seen.add(task.gid);
              merged.push(task);
            }
          }
        }

        merged.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          const da = a.due_on ? parseLocalDate(a.due_on).getTime() : Infinity;
          const db = b.due_on ? parseLocalDate(b.due_on).getTime() : Infinity;
          return da - db;
        });

        setTasks(merged);
      } catch (e: any) {
        setError(e.message || "Failed to load tasks");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [members]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            Household Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 text-accent animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            Household Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            Household Actions
          </CardTitle>
          {activeTasks.length > 0 && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
              {activeTasks.length} active
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No tasks across household members.
          </p>
        ) : (
          <>
            {activeTasks.map((task) => {
              const status = getTaskStatus(task);
              return (
                <div
                  key={task.gid}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
                >
                  <Clock className="h-4 w-4 text-accent shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{task.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Link
                        to={`/contacts/${task.ownerContactId}`}
                        className="text-[10px] text-accent hover:underline"
                      >
                        {task.ownerName}
                      </Link>
                      {task.due_on && (
                        <span className="text-[10px] text-muted-foreground">
                          Due {parseLocalDate(task.due_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={status.variant} className="text-[9px] shrink-0">
                    {status.label}
                  </Badge>
                </div>
              );
            })}

            {completedTasks.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowCompleted((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium hover:text-foreground transition-colors mb-1.5"
                >
                  {showCompleted ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Completed ({completedTasks.length})
                </button>
                {showCompleted && completedTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.gid}
                    className="flex items-center gap-3 rounded-lg px-4 py-2 opacity-50"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground truncate line-through flex-1">{task.name}</p>
                    <Link
                      to={`/contacts/${task.ownerContactId}`}
                      className="text-[10px] text-muted-foreground hover:underline shrink-0"
                    >
                      {task.ownerName}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
