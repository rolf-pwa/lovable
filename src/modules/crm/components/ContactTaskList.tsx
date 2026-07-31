import { useState, useEffect, useCallback } from "react";
import { parseLocalDate } from "@/shared/lib/date-utils";
import { supabase } from "@/shared/integrations/supabase/client";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  CheckSquare,
  Loader2,
  AlertCircle,
  Sparkles,
  RotateCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Send,
  Save,
  X,
  Calendar,
  FileText,
  Pencil,
  Users,
  Plus,
  Eye,
  EyeOff,
} from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { Separator } from "@/shared/components/ui/separator";
import { toast } from "sonner";
import { AssigneePicker } from "@/modules/crm/components/AssigneePicker";

// ── Types ──
interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  notes: string;
  assignee?: { gid: string; name: string } | null;
  memberships?: { section?: { name?: string } }[];
  custom_fields?: any[];
  num_subtasks?: number;
}

interface AsanaMember {
  gid: string;
  name: string;
  email?: string;
}

interface AsanaComment {
  gid: string;
  text: string;
  created_at: string;
  created_by?: { name?: string };
}

interface VisibilityFieldInfo {
  fieldGid: string;
  internalOnlyGid: string;
  clientVisibleGid: string;
}

interface HouseholdMemberInfo {
  id: string;
  first_name: string;
  last_name: string | null;
  family_role: string;
}

interface Props {
  asanaUrl: string | null;
  contactId?: string;
  householdMembers?: HouseholdMemberInfo[];
}

// Helper to fire task notification (non-blocking)
function notifyTaskUpdate(contactId: string | undefined, taskName: string, taskEvent: string) {
  if (!contactId) return;
  supabase.functions.invoke("notify-portal-request", {
    body: { notify_type: "task", contact_id: contactId, task_name: taskName, task_event: taskEvent },
  }).catch((e) => console.error("[Notify] Task notification error:", e));
}

// ── Linkify helper ──
function Linkify({ children }: { children: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = children.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all hover:text-accent/80">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ── URL Helpers ──
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

// ── Task Helpers ──
type TaskCategory = "new" | "ongoing";

function getTaskStatus(task: AsanaTask): {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
} {
  if (task.completed) return { label: "Done", variant: "secondary" };
  const section = task.memberships?.[0]?.section?.name?.toLowerCase() || "";
  if (section.includes("review") || section.includes("awaiting"))
    return { label: "Awaiting Review", variant: "outline" };
  if (section.includes("progress") || section.includes("doing"))
    return { label: "In Progress", variant: "default" };
  if (task.due_on && parseLocalDate(task.due_on) < new Date())
    return { label: "Overdue", variant: "destructive" };
  return { label: "Open", variant: "outline" };
}

function categorise(task: AsanaTask): TaskCategory {
  const section = task.memberships?.[0]?.section?.name?.toLowerCase() || "";
  if (
    section.includes("progress") ||
    section.includes("doing") ||
    section.includes("review") ||
    section.includes("awaiting") ||
    section.includes("ongoing")
  )
    return "ongoing";
  return "new";
}

function getVisibility(task: AsanaTask): string | null {
  const cf = task.custom_fields?.find(
    (f: any) =>
      f.name === "PW_Visibility" ||
      f.name?.toLowerCase().includes("visibility"),
  );
  return cf?.enum_value?.name || null;
}

// ── Visibility Select (inline editable) ──
function VisibilitySelect({
  value,
  onChange,
  disabled,
}: {
  value: "client_visible" | "internal_only";
  onChange: (v: "client_visible" | "internal_only") => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as any)}
      disabled={disabled}
      className="h-7 rounded-md border bg-background px-2 text-xs text-foreground disabled:opacity-50"
    >
      <option value="client_visible">Client Visible</option>
      <option value="internal_only">Internal Only</option>
    </select>
  );
}

// ── Inline Visibility Badge/Toggle ──
function VisibilityToggle({
  task,
  visFieldInfo,
  onUpdated,
}: {
  task: AsanaTask;
  visFieldInfo: VisibilityFieldInfo | null;
  onUpdated?: (t: AsanaTask) => void;
}) {
  const visibility = getVisibility(task);
  const [updating, setUpdating] = useState(false);

  if (!visFieldInfo || !visibility) return null;

  const currentValue: "client_visible" | "internal_only" =
    visibility === "Client Visible" ? "client_visible" : "internal_only";

  const handleChange = async (newVal: "client_visible" | "internal_only") => {
    if (newVal === currentValue) return;
    setUpdating(true);
    try {
      const res = await supabase.functions.invoke("asana-service", {
        body: {
          action: "updateTask",
          task_gid: task.gid,
          updates: {
            custom_fields: {
              [visFieldInfo.fieldGid]: newVal === "client_visible"
                ? visFieldInfo.clientVisibleGid
                : visFieldInfo.internalOnlyGid,
            },
          },
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      // Update the task's custom_fields locally
      const updatedCf = (task.custom_fields || []).map((cf: any) => {
        if (cf.gid === visFieldInfo.fieldGid) {
          return {
            ...cf,
            enum_value: {
              ...cf.enum_value,
              name: newVal === "client_visible" ? "Client Visible" : "Internal Only",
              gid: newVal === "client_visible" ? visFieldInfo.clientVisibleGid : visFieldInfo.internalOnlyGid,
            },
          };
        }
        return cf;
      });
      onUpdated?.({ ...task, custom_fields: updatedCf });
      toast.success(`Visibility set to ${newVal === "client_visible" ? "Client Visible" : "Internal Only"}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update visibility");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <VisibilitySelect value={currentValue} onChange={handleChange} disabled={updating} />
  );
}

// ── Add Task/Subtask Form ──
function AddTaskForm({
  placeholder,
  visFieldInfo,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  visFieldInfo: VisibilityFieldInfo | null;
  onSubmit: (name: string, dueOn: string, visibility: "client_visible" | "internal_only") => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [visibility, setVisibility] = useState<"client_visible" | "internal_only">("internal_only");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onSubmit(name.trim(), dueOn, visibility);
      setName("");
      setDueOn("");
      setVisibility("internal_only");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Input
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          className="h-7 w-36 text-xs"
        />
        {visFieldInfo && (
          <VisibilitySelect value={visibility} onChange={setVisibility} />
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!name.trim() || creating}
          onClick={handleSubmit}
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── TaskRow with subtask nesting ──
function TaskRow({
  task,
  completed,
  onClick,
  depth = 0,
  visFieldInfo,
  onTaskUpdated,
  clientViewedGids,
  contactId,
}: {
  task: AsanaTask;
  completed?: boolean;
  onClick: () => void;
  depth?: number;
  visFieldInfo?: VisibilityFieldInfo | null;
  onTaskUpdated?: (t: AsanaTask) => void;
  clientViewedGids?: Set<string>;
  contactId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState<AsanaTask[]>([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [subtasksFetched, setSubtasksFetched] = useState(false);
  const [togglingComplete, setTogglingComplete] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateValue, setDueDateValue] = useState(task.due_on || "");

  const status = getTaskStatus(task);
  const visibility = getVisibility(task);

  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!expanded && !subtasksFetched) {
      setSubtasksLoading(true);
      try {
        const res = await supabase.functions.invoke("asana-service", {
          body: { action: "getSubtasks", task_gid: task.gid },
        });
        if (!res.error && !res.data?.error) {
          setSubtasks(res.data?.data || []);
        }
      } catch {
        // silent
      } finally {
        setSubtasksLoading(false);
        setSubtasksFetched(true);
      }
    }
    setExpanded(!expanded);
  };

  const handleSubtaskUpdated = (updatedSub: AsanaTask) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.gid === updatedSub.gid ? { ...s, ...updatedSub } : s)),
    );
  };

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingComplete(true);
    try {
      const newCompleted = !task.completed;
      const res = await supabase.functions.invoke("asana-service", {
        body: {
          action: "updateTask",
          task_gid: task.gid,
          updates: { completed: newCompleted },
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      onTaskUpdated?.({ ...task, completed: newCompleted });
      toast.success(newCompleted ? "Marked complete" : "Marked incomplete");
      if (newCompleted) {
        notifyTaskUpdate(contactId, task.name, "completed");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to update task");
    } finally {
      setTogglingComplete(false);
    }
  };

  const handleDueDateChange = async (newDate: string) => {
    setDueDateValue(newDate);
    setEditingDueDate(false);
    try {
      const res = await supabase.functions.invoke("asana-service", {
        body: {
          action: "updateTask",
          task_gid: task.gid,
          updates: { due_on: newDate || null },
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      onTaskUpdated?.({ ...task, due_on: newDate || null });
      toast.success("Due date updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update due date");
      setDueDateValue(task.due_on || "");
    }
  };

  return (
    <div style={{ marginLeft: depth > 0 ? `${depth * 16}px` : undefined }}>
      <div
        className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors w-full text-left ${
          completed ? "opacity-50" : "bg-muted/50 hover:bg-muted"
        }`}
      >
        {/* Completion checkbox for subtasks */}
        {depth > 0 && (
          <button
            onClick={handleToggleComplete}
            disabled={togglingComplete}
            className="shrink-0 p-0.5 rounded hover:bg-background/80 transition-colors"
            title={task.completed ? "Mark incomplete" : "Mark complete"}
          >
            {togglingComplete ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <Checkbox checked={task.completed} className="h-3.5 w-3.5 pointer-events-none" />
            )}
          </button>
        )}

        {/* Expand toggle */}
        <button
          onClick={handleToggleExpand}
          className="shrink-0 p-0.5 rounded hover:bg-background/80 transition-colors"
        >
          {subtasksLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>

        {/* Task name - clickable to open detail */}
        <button onClick={onClick} className="min-w-0 flex-1 text-left">
          <p
            className={`text-sm font-medium truncate ${completed ? "line-through text-muted-foreground" : "text-foreground"}`}
          >
            {task.name}
          </p>
          {task.due_on && !completed && !editingDueDate && depth === 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Due{" "}
              {parseLocalDate(task.due_on).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Inline due date for subtasks */}
          {depth > 0 && (
            editingDueDate ? (
              <Input
                type="date"
                value={dueDateValue}
                onChange={(e) => handleDueDateChange(e.target.value)}
                onBlur={() => setEditingDueDate(false)}
                autoFocus
                className="h-6 w-28 text-[10px] px-1"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setEditingDueDate(true); }}
                className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5 hover:bg-background/80"
                title="Set due date"
              >
                <Calendar className="h-2.5 w-2.5" />
                {task.due_on
                  ? parseLocalDate(task.due_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "No date"}
              </button>
            )
          )}

          {clientViewedGids?.has(task.gid) && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-accent/40 text-accent bg-accent/10">
              <Eye className="h-2.5 w-2.5 mr-0.5" />Viewed
            </Badge>
          )}
          <AssigneePicker
            currentAssignee={task.assignee}
            taskGid={task.gid}
            onAssigneeChanged={(newAssignee) => {
              const updated = { ...task, assignee: newAssignee };
              onTaskUpdated?.(updated);
            }}
          />
          {visibility && (
            <Badge
              variant={visibility === "Client Visible" ? "default" : "secondary"}
              className="text-[9px] px-1.5 py-0"
            >
              {visibility === "Client Visible" ? (
                <><Eye className="h-2.5 w-2.5 mr-0.5" />Client</>
              ) : (
                <><EyeOff className="h-2.5 w-2.5 mr-0.5" />Internal</>
              )}
            </Badge>
          )}
          <Badge variant={status.variant} className="text-[9px] px-1.5 py-0">
            {status.label}
          </Badge>
        </div>
      </div>

      {/* Nested subtasks */}
      {expanded && subtasksFetched && subtasks.length > 0 && (
        <div className="mt-1 space-y-1">
          {subtasks.map((sub) => (
            <TaskRow
              key={sub.gid}
              task={sub}
              completed={sub.completed}
              onClick={onClick}
              depth={depth + 1}
              visFieldInfo={visFieldInfo}
              onTaskUpdated={handleSubtaskUpdated}
              clientViewedGids={clientViewedGids}
              contactId={contactId}
            />
          ))}
        </div>
      )}
      {expanded && subtasksFetched && subtasks.length === 0 && !subtasksLoading && (
        <p className="text-[10px] text-muted-foreground pl-8 py-1 italic">No subtasks</p>
      )}
    </div>
  );
}

// ── Main Component ──
export function ContactTaskList({ asanaUrl, contactId, householdMembers = [] }: Props) {
  const [tasks, setTasks] = useState<AsanaTask[]>([]);
  const [members, setMembers] = useState<AsanaMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AsanaTask | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [visFieldInfo, setVisFieldInfo] = useState<VisibilityFieldInfo | null>(null);
  const [clientViewedGids, setClientViewedGids] = useState<Set<string>>(new Set());

  const projectGid = extractProjectGid(asanaUrl);
  const taskBased = isTaskUrl(asanaUrl);
  const parentTaskGid = taskBased ? extractTaskGid(asanaUrl) : null;

  const fetchTasks = useCallback(async () => {
    if (!projectGid && !parentTaskGid) {
      setLoading(false);
      return;
    }
    try {
      const tasksBody: any = { action: "getTasksForProject" };
      if (taskBased && parentTaskGid) {
        tasksBody.action = "getSubtasks";
        tasksBody.task_gid = parentTaskGid;
      } else {
        tasksBody.project_gid = projectGid;
      }

      const promises: Promise<any>[] = [
        supabase.functions.invoke("asana-service", { body: tasksBody }),
      ];
      if (projectGid && !taskBased) {
        promises.push(
          supabase.functions.invoke("asana-service", {
            body: { action: "getProjectMembers", project_gid: projectGid },
          }),
        );
      }

      const [tasksRes, membersRes] = await Promise.all(promises);
      if (tasksRes.error) throw tasksRes.error;
      if (tasksRes.data?.error) {
        setError(tasksRes.data.error);
      } else {
        const fetchedTasks = tasksRes.data?.data || [];
        setTasks(fetchedTasks);

        // Lookup visibility field info from the first task that has custom_fields
        if (!visFieldInfo) {
          let found = false;
          if (fetchedTasks.length > 0) {
            const taskWithCf = fetchedTasks.find((t: any) => t.custom_fields?.length > 0);
            if (taskWithCf) {
              const cf = taskWithCf.custom_fields.find(
                (f: any) => f.name === "PW_Visibility" || f.name?.toLowerCase().includes("visibility"),
              );
              if (cf?.enum_options) {
                const internalOpt = cf.enum_options.find((o: any) => o.name === "Internal Only");
                const clientOpt = cf.enum_options.find((o: any) => o.name === "Client Visible");
                if (internalOpt && clientOpt) {
                  setVisFieldInfo({
                    fieldGid: cf.gid,
                    internalOnlyGid: internalOpt.gid,
                    clientVisibleGid: clientOpt.gid,
                  });
                  found = true;
                }
              }
            }
          }
          // Fallback: lookup from parent task or first fetched task
          if (!found) {
            const lookupGid = parentTaskGid || fetchedTasks[0]?.gid;
            if (lookupGid) {
              const res = await supabase.functions.invoke("asana-service", {
                body: { action: "lookupVisibilityField", task_gid: lookupGid },
              });
              if (!res.error && res.data?.data) {
                setVisFieldInfo(res.data.data);
              }
            }
          }
        }
      }
      if (membersRes && !membersRes.error && !membersRes.data?.error) {
        setMembers(membersRes.data?.data || []);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [projectGid, parentTaskGid, taskBased]);

  useEffect(() => {
    fetchTasks();
    // Fetch client-viewed task gids
    if (contactId) {
      supabase
        .from("portal_task_interactions")
        .select("task_gid")
        .eq("contact_id", contactId)
        .then(({ data }) => {
          if (data) setClientViewedGids(new Set(data.map((r: any) => r.task_gid)));
        });
    }
  }, [fetchTasks, contactId]);

  const handleTaskUpdated = (updatedTask: AsanaTask) => {
    setTasks((prev) =>
      prev.map((t) => (t.gid === updatedTask.gid ? { ...t, ...updatedTask } : t)),
    );
    setSelectedTask((prev) =>
      prev?.gid === updatedTask.gid ? { ...prev, ...updatedTask } : prev,
    );
  };

  const handleCreateTask = async (name: string, dueOn: string, visibility: "client_visible" | "internal_only") => {
    const body: any = {
      name,
      due_on: dueOn || undefined,
    };

    // Build custom_fields for visibility
    if (visFieldInfo) {
      body.custom_fields = {
        [visFieldInfo.fieldGid]: visibility === "client_visible"
          ? visFieldInfo.clientVisibleGid
          : visFieldInfo.internalOnlyGid,
      };
    }

    if (taskBased && parentTaskGid) {
      body.action = "createSubtask";
      body.parent_task_gid = parentTaskGid;
      if (projectGid) body.project_gid = projectGid;
    } else {
      body.action = "createTask";
      body.project_gid = projectGid;
    }

    const res = await supabase.functions.invoke("asana-service", { body });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);

    toast.success("Task created.");
    setShowAddTask(false);
    fetchTasks();
  };

  if (!asanaUrl || (!projectGid && !parentTaskGid)) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No Asana project linked.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            Tasks
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
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            Tasks
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

  const active = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const newTasks = active.filter((t) => categorise(t) === "new");
  const ongoingTasks = active.filter((t) => categorise(t) === "ongoing");

  const renderTaskRow = (task: AsanaTask, isCompleted?: boolean) => {
    const isSelected = selectedTask?.gid === task.gid;
    return (
      <div key={task.gid}>
        <TaskRow
          task={task}
          completed={isCompleted}
          onClick={() => setSelectedTask(isSelected ? null : task)}
          visFieldInfo={visFieldInfo}
          onTaskUpdated={handleTaskUpdated}
          clientViewedGids={clientViewedGids}
          contactId={contactId}
        />
        {isSelected && (
          <div className="mt-1 rounded-md border border-border bg-background p-4">
            <TaskDetailPanel
              task={task}
              members={members}
              visFieldInfo={visFieldInfo}
              onUpdated={handleTaskUpdated}
              onClose={() => setSelectedTask(null)}
              onSubtaskCreated={fetchTasks}
              contactId={contactId}
              householdMembers={householdMembers}
              asanaProjectGid={projectGid}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            Tasks
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {active.length > 0 && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                {active.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowAddTask(!showAddTask)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddTask && (
          <AddTaskForm
            placeholder={taskBased ? "New subtask name…" : "New task name…"}
            visFieldInfo={visFieldInfo}
            onSubmit={handleCreateTask}
            onCancel={() => setShowAddTask(false)}
          />
        )}

        {active.length === 0 && completed.length === 0 && !showAddTask && (
          <p className="text-sm text-muted-foreground text-center py-2">
            No tasks found.
          </p>
        )}

        {newTasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              <Sparkles className="h-3 w-3" />
              New ({newTasks.length})
            </div>
            {newTasks.map((task) => renderTaskRow(task))}
          </div>
        )}

        {ongoingTasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              <RotateCw className="h-3 w-3" />
              Ongoing ({ongoingTasks.length})
            </div>
            {ongoingTasks.map((task) => renderTaskRow(task))}
          </div>
        )}

        {completed.length > 0 && (
          <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider w-full hover:text-foreground transition-colors">
              {completedOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Completed ({completed.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 mt-1.5">
              {completed.slice(0, 10).map((task) => renderTaskRow(task, true))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <a
          href={asanaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
        >
          Open in Asana
          <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
  );
}

// ── SubtaskDetailRow – Expandable inline subtask with visibility + comments ──
function SubtaskDetailRow({
  subtask,
  visFieldInfo,
  onUpdated,
  contactId,
}: {
  subtask: AsanaTask;
  visFieldInfo: VisibilityFieldInfo | null;
  onUpdated: (t: AsanaTask) => void;
  contactId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<AsanaComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsFetched, setCommentsFetched] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [togglingComplete, setTogglingComplete] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateValue, setDueDateValue] = useState(subtask.due_on || "");

  const subStatus = getTaskStatus(subtask);

  const handleToggle = async () => {
    if (!expanded && !commentsFetched) {
      setCommentsLoading(true);
      try {
        const res = await supabase.functions.invoke("asana-service", {
          body: { action: "getTaskStories", task_gid: subtask.gid },
        });
        if (!res.error && !res.data?.error) {
          setComments(res.data?.data || []);
        }
      } catch {
        // silent
      } finally {
        setCommentsLoading(false);
        setCommentsFetched(true);
      }
    }
    setExpanded(!expanded);
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const res = await supabase.functions.invoke("asana-service", {
        body: { action: "postTaskComment", task_gid: subtask.gid, text: newComment.trim() },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      setComments((prev) => [
        ...prev,
        { gid: Date.now().toString(), text: newComment.trim(), created_at: new Date().toISOString(), created_by: { name: "You" } },
      ]);
      setNewComment("");
      toast.success("Comment posted.");
    } catch (e: any) {
      toast.error(e.message || "Failed to post comment.");
    } finally {
      setPosting(false);
    }
  };

  const handleToggleComplete = async () => {
    setTogglingComplete(true);
    try {
      const newCompleted = !subtask.completed;
      const res = await supabase.functions.invoke("asana-service", {
        body: { action: "updateTask", task_gid: subtask.gid, updates: { completed: newCompleted } },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      onUpdated({ ...subtask, completed: newCompleted });
      toast.success(newCompleted ? "Marked complete" : "Marked incomplete");
      if (newCompleted) notifyTaskUpdate(contactId, subtask.name, "completed");
    } catch (e: any) {
      toast.error(e.message || "Failed to update subtask");
    } finally {
      setTogglingComplete(false);
    }
  };

  const handleDueDateChange = async (newDate: string) => {
    setDueDateValue(newDate);
    setEditingDueDate(false);
    try {
      const res = await supabase.functions.invoke("asana-service", {
        body: { action: "updateTask", task_gid: subtask.gid, updates: { due_on: newDate || null } },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      onUpdated({ ...subtask, due_on: newDate || null });
      toast.success("Due date updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update due date");
      setDueDateValue(subtask.due_on || "");
    }
  };

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Header row */}
      <div
        className={`flex items-center gap-2 px-2.5 py-2 text-sm w-full text-left transition-colors ${
          subtask.completed ? "opacity-50 bg-muted/30" : "bg-muted/50 hover:bg-muted"
        }`}
      >
        {/* Completion toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleComplete(); }}
          disabled={togglingComplete}
          className="shrink-0 p-0.5 rounded hover:bg-background/80 transition-colors"
          title={subtask.completed ? "Mark incomplete" : "Mark complete"}
        >
          {togglingComplete ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Checkbox checked={subtask.completed} className="h-3.5 w-3.5 pointer-events-none" />
          )}
        </button>

        {/* Expand toggle */}
        <button onClick={handleToggle} className="shrink-0 p-0.5 rounded hover:bg-background/80 transition-colors">
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>

        {/* Name */}
        <button onClick={handleToggle} className="min-w-0 flex-1 text-left">
          <p className={`text-sm truncate ${subtask.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {subtask.name}
          </p>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Inline due date */}
          {editingDueDate ? (
            <Input
              type="date"
              value={dueDateValue}
              onChange={(e) => handleDueDateChange(e.target.value)}
              onBlur={() => setEditingDueDate(false)}
              autoFocus
              className="h-6 w-28 text-[10px] px-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingDueDate(true); }}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5 hover:bg-background/80"
              title="Set due date"
            >
              <Calendar className="h-2.5 w-2.5" />
              {subtask.due_on
                ? parseLocalDate(subtask.due_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "No date"}
            </button>
          )}

          {/* Assignee */}
          <AssigneePicker
            currentAssignee={subtask.assignee}
            taskGid={subtask.gid}
            onAssigneeChanged={(newAssignee) => {
              onUpdated({ ...subtask, assignee: newAssignee });
            }}
          />

          <Badge variant={subStatus.variant} className="text-[9px] px-1.5 py-0">
            {subStatus.label}
          </Badge>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 py-3 space-y-3 border-t border-border bg-background">
          {/* Visibility */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-medium">Visibility:</span>
            <VisibilityToggle task={subtask} visFieldInfo={visFieldInfo} onUpdated={onUpdated} />
          </div>


          {/* Notes */}
          {subtask.notes && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 whitespace-pre-wrap">
              <Linkify>{subtask.notes}</Linkify>
            </div>
          )}

          {/* Comments */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              <MessageSquare className="h-2.5 w-2.5" />
              Comments {commentsFetched ? `(${comments.length})` : ""}
            </div>

            {commentsLoading ? (
              <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
            ) : comments.length === 0 && commentsFetched ? (
              <p className="text-[10px] text-muted-foreground italic">No comments</p>
            ) : (
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.gid} className="rounded bg-muted/50 px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium">{c.created_by?.name || "Unknown"}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs whitespace-pre-wrap"><Linkify>{c.text}</Linkify></p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-1.5">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Comment…"
                rows={1}
                className="text-xs flex-1 min-h-[32px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePostComment();
                }}
              />
              <Button
                size="icon"
                className="shrink-0 h-8 w-8"
                onClick={handlePostComment}
                disabled={posting || !newComment.trim()}
              >
                {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Task Detail Panel (inside Sheet) ──
function TaskDetailPanel({
  task,
  members,
  visFieldInfo,
  onUpdated,
  onClose,
  onSubtaskCreated,
  contactId,
  householdMembers = [],
  asanaProjectGid,
}: {
  task: AsanaTask;
  members: AsanaMember[];
  visFieldInfo: VisibilityFieldInfo | null;
  onUpdated: (t: AsanaTask) => void;
  onClose: () => void;
  onSubtaskCreated?: () => void;
  contactId?: string;
  householdMembers?: HouseholdMemberInfo[];
  asanaProjectGid?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(task.name);
  const [editNotes, setEditNotes] = useState(task.notes || "");
  const [editDueOn, setEditDueOn] = useState(task.due_on || "");
  const [editAssignee, setEditAssignee] = useState(task.assignee?.gid || "");

  const [taggedContactIds, setTaggedContactIds] = useState<string[]>([]);
  const [taggingLoading, setTaggingLoading] = useState(false);
  const [tagSaving, setTagSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const [comments, setComments] = useState<AsanaComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const [showAddSubtask, setShowAddSubtask] = useState(false);

  // Subtasks in detail panel
  const [detailSubtasks, setDetailSubtasks] = useState<AsanaTask[]>([]);
  const [detailSubtasksLoading, setDetailSubtasksLoading] = useState(true);

  const visibility = getVisibility(task);

  // Reset state when task changes
  useEffect(() => {
    setEditName(task.name);
    setEditNotes(task.notes || "");
    setEditDueOn(task.due_on || "");
    setEditAssignee(task.assignee?.gid || "");
    setEditing(false);
    setShowAddSubtask(false);
  }, [task.gid, task.name, task.notes, task.due_on, task.assignee?.gid]);

  // Fetch tagged household members for this task
  useEffect(() => {
    if (householdMembers.length === 0) return;
    setTaggingLoading(true);
    supabase.functions.invoke("asana-service", {
      body: { action: "getCollaboratorsForTask", task_gid: task.gid },
    }).then((res) => {
      if (!res.error && Array.isArray(res.data?.data)) {
        setTaggedContactIds(res.data.data);
      }
    }).finally(() => setTaggingLoading(false));
  }, [task.gid, householdMembers.length]);

  const handleToggleTag = async (memberId: string, checked: boolean) => {
    setTagSaving(true);
    try {
      if (checked) {
        await supabase.functions.invoke("asana-service", {
          body: { action: "tagCollaborators", task_gid: task.gid, contact_ids: [memberId] },
        });
        setTaggedContactIds((prev) => [...prev, memberId]);
        toast.success("Household member tagged.");
      } else {
        await supabase.functions.invoke("asana-service", {
          body: { action: "untagCollaborator", task_gid: task.gid, contact_id: memberId },
        });
        setTaggedContactIds((prev) => prev.filter((id) => id !== memberId));
        toast.success("Household member untagged.");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to update tagging.");
    } finally {
      setTagSaving(false);
    }
  };

  // Fetch comments + subtasks
  useEffect(() => {
    (async () => {
      setCommentsLoading(true);
      setDetailSubtasksLoading(true);
      try {
        const [commentsRes, subtasksRes] = await Promise.all([
          supabase.functions.invoke("asana-service", {
            body: { action: "getTaskStories", task_gid: task.gid },
          }),
          supabase.functions.invoke("asana-service", {
            body: { action: "getSubtasks", task_gid: task.gid },
          }),
        ]);
        if (!commentsRes.error && !commentsRes.data?.error) {
          setComments(commentsRes.data?.data || []);
        }
        if (!subtasksRes.error && !subtasksRes.data?.error) {
          setDetailSubtasks(subtasksRes.data?.data || []);
        }
      } catch {
        // silent
      } finally {
        setCommentsLoading(false);
        setDetailSubtasksLoading(false);
      }
    })();
  }, [task.gid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: any = {};
      if (editName !== task.name) updates.name = editName;
      if (editNotes !== (task.notes || "")) updates.notes = editNotes;
      if (editDueOn !== (task.due_on || ""))
        updates.due_on = editDueOn || null;
      if (editAssignee !== (task.assignee?.gid || ""))
        updates.assignee = editAssignee || null;

      if (Object.keys(updates).length === 0) {
        setEditing(false);
        setSaving(false);
        return;
      }

      const res = await supabase.functions.invoke("asana-service", {
        body: { action: "updateTask", task_gid: task.gid, updates },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      const assigneeMember = members.find((m) => m.gid === editAssignee);
      onUpdated({
        ...task,
        ...updates,
        assignee: assigneeMember ? { gid: assigneeMember.gid, name: assigneeMember.name } : updates.assignee === null ? null : task.assignee,
      });
      notifyTaskUpdate(contactId, task.name, "updated");
      toast.success("Task updated.");
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update task.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleComplete = async () => {
    setSaving(true);
    try {
      const newCompleted = !task.completed;
      const res = await supabase.functions.invoke("asana-service", {
        body: {
          action: "updateTask",
          task_gid: task.gid,
          updates: { completed: newCompleted },
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      onUpdated({ ...task, completed: newCompleted });
      notifyTaskUpdate(contactId, task.name, newCompleted ? "completed" : "reopened");
      toast.success(newCompleted ? "Task completed." : "Task reopened.");
    } catch (e: any) {
      toast.error(e.message || "Failed to update task.");
    } finally {
      setSaving(false);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const res = await supabase.functions.invoke("asana-service", {
        body: {
          action: "postTaskComment",
          task_gid: task.gid,
          text: newComment.trim(),
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      setComments((prev) => [
        ...prev,
        {
          gid: Date.now().toString(),
          text: newComment.trim(),
          created_at: new Date().toISOString(),
          created_by: { name: "You" },
        },
      ]);
      setNewComment("");
      notifyTaskUpdate(contactId, task.name, "comment");
      toast.success("Comment posted.");
    } catch (e: any) {
      toast.error(e.message || "Failed to post comment.");
    } finally {
      setPosting(false);
    }
  };

  const handleCreateSubtask = async (name: string, dueOn: string, vis: "client_visible" | "internal_only") => {
    const body: any = {
      action: "createSubtask",
      parent_task_gid: task.gid,
      name,
      due_on: dueOn || undefined,
    };
    if (visFieldInfo) {
      body.custom_fields = {
        [visFieldInfo.fieldGid]: vis === "client_visible"
          ? visFieldInfo.clientVisibleGid
          : visFieldInfo.internalOnlyGid,
      };
    }
    // Pass project_gid so the subtask can be added to the project for custom field support
    if (asanaProjectGid) body.project_gid = asanaProjectGid;
    const res = await supabase.functions.invoke("asana-service", { body });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);

    toast.success("Subtask created.");
    setShowAddSubtask(false);

    // Refresh detail subtasks
    const refreshRes = await supabase.functions.invoke("asana-service", {
      body: { action: "getSubtasks", task_gid: task.gid },
    });
    if (!refreshRes.error && !refreshRes.data?.error) {
      setDetailSubtasks(refreshRes.data?.data || []);
    }
    onSubtaskCreated?.();
  };

  const status = getTaskStatus(task);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={status.variant} className="text-xs">
              {status.label}
            </Badge>
            <VisibilityToggle task={task} visFieldInfo={visFieldInfo} onUpdated={onUpdated} />
          </div>
          <div className="flex items-center gap-1">
            {!editing && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {editing ? (
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="text-lg font-semibold"
          />
        ) : (
          <h3 className="text-lg font-semibold leading-tight">
            {task.name}
          </h3>
        )}
      </div>

      {/* Meta rows */}
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {editing ? (
            <Input
              type="date"
              value={editDueOn}
              onChange={(e) => setEditDueOn(e.target.value)}
              className="h-7 w-36 text-xs"
            />
          ) : (
            <span>
              {task.due_on
                ? parseLocalDate(task.due_on).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "No due date"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <AssigneePicker
            currentAssignee={task.assignee}
            taskGid={task.gid}
            onAssigneeChanged={(newAssignee) => {
              onUpdated({ ...task, assignee: newAssignee });
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={task.completed ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={handleToggleComplete}
            disabled={saving}
          >
            {task.completed ? "Reopen" : "Mark Complete"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowAddSubtask(!showAddSubtask)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Subtask
          </Button>
        </div>

        {showAddSubtask && (
          <AddTaskForm
            placeholder="Subtask name…"
            visFieldInfo={visFieldInfo}
            onSubmit={handleCreateSubtask}
            onCancel={() => setShowAddSubtask(false)}
          />
        )}
      </div>

      {/* Tag Household Members */}
      {householdMembers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <Users className="h-3 w-3" />
            Tag Household Members
          </div>
          {taggingLoading ? (
            <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          ) : (
            <div className="space-y-1.5">
              {householdMembers.map((hm) => {
                const isTagged = taggedContactIds.includes(hm.id);
                return (
                  <label
                    key={hm.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={isTagged}
                      disabled={tagSaving}
                      onCheckedChange={(checked) => handleToggleTag(hm.id, !!checked)}
                    />
                    <span className="text-sm text-foreground">
                      {hm.first_name} {hm.last_name || ""}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize ml-auto">
                      {hm.family_role.replace(/_/g, " ")}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Tagged members will see this task in their portal Action Items.
          </p>
        </div>
      )}

      {/* Subtasks */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <CheckSquare className="h-3 w-3" />
          Subtasks ({detailSubtasks.length})
        </div>
        {detailSubtasksLoading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          </div>
        ) : detailSubtasks.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-1">No subtasks</p>
        ) : (
          <div className="space-y-1">
            {detailSubtasks.map((sub) => (
              <SubtaskDetailRow
                key={sub.gid}
                subtask={sub}
                visFieldInfo={visFieldInfo}
                contactId={contactId}
                onUpdated={(updated) => {
                  setDetailSubtasks((prev) =>
                    prev.map((s) => (s.gid === updated.gid ? { ...s, ...updated } : s)),
                  );
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <FileText className="h-3 w-3" />
          Notes
        </div>
        {editing ? (
          <Textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={5}
            placeholder="Add notes..."
            className="text-sm"
          />
        ) : (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap min-h-[60px]">
              {task.notes ? (
                <Linkify>{task.notes}</Linkify>
              ) : (
                <span className="text-muted-foreground italic">No notes</span>
              )}
            </div>
        )}
      </div>

      {/* Edit actions */}
      {editing && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditName(task.name);
              setEditNotes(task.notes || "");
              setEditDueOn(task.due_on || "");
              setEditAssignee(task.assignee?.gid || "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      <Separator />

      {/* Comments */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <MessageSquare className="h-3 w-3" />
          Comments ({comments.length})
        </div>

        {commentsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            No comments yet.
          </p>
        ) : (
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {comments.map((comment) => (
              <div
                key={comment.gid}
                className="rounded-md bg-muted/50 px-3 py-2 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    {comment.created_by?.name || "Unknown"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(comment.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap"><Linkify>{comment.text}</Linkify></p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            rows={2}
            className="text-sm flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handlePostComment();
              }
            }}
          />
          <Button
            size="icon"
            className="shrink-0 self-end h-9 w-9"
            onClick={handlePostComment}
            disabled={posting || !newComment.trim()}
          >
            {posting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Press ⌘+Enter to send
        </p>
      </div>
    </div>
  );
}
