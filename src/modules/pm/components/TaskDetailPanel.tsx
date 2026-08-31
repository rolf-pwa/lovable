import { useEffect, useState } from "react";
import { Textarea } from "@/shared/components/ui/textarea";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Loader2, Send, Plus } from "lucide-react";
import { toast } from "sonner";
import { getTaskAgent } from "@/shared/lib/agents";
import type { PmTask, PmTaskComment } from "@/shared/lib/agents";
import { StaffAssigneePicker } from "./StaffAssigneePicker";
import { supabase } from "@/shared/integrations/supabase/client";
import { cn } from "@/shared/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

interface Props {
  task: PmTask;
  onChanged: (task: PmTask) => void;
}

export function TaskDetailPanel({ task, onChanged }: Props) {
  const [description, setDescription] = useState(task.description || "");
  const [comments, setComments] = useState<PmTaskComment[]>([]);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  const [commentBody, setCommentBody] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [sending, setSending] = useState(false);
  const [subtasks, setSubtasks] = useState<PmTask[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(true);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);

  useEffect(() => {
    setDescription(task.description || "");
  }, [task.id]);

  useEffect(() => {
    let cancelled = false;
    setLoadingSubtasks(true);
    getTaskAgent()
      .listTasks({ parent_task_id: task.id })
      .then((data) => {
        if (!cancelled) setSubtasks(data);
      })
      .finally(() => !cancelled && setLoadingSubtasks(false));
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  useEffect(() => {
    let cancelled = false;
    setLoadingComments(true);
    getTaskAgent()
      .getTaskComments(task.id)
      .then(async (data) => {
        if (cancelled) return;
        setComments(data);
        const ids = Array.from(new Set(data.map((c) => c.author_id)));
        if (ids.length) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
          if (!cancelled) {
            const map: Record<string, string> = {};
            for (const p of profiles || []) map[p.user_id] = p.full_name || p.email || p.user_id.slice(0, 8);
            setAuthorNames(map);
          }
        }
      })
      .finally(() => !cancelled && setLoadingComments(false));
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const saveDescription = async () => {
    if (description === (task.description || "")) return;
    try {
      const updated = await getTaskAgent().updateTask(task.id, { description });
      onChanged(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the description.");
    }
  };

  const setStatus = async (status: string) => {
    try {
      const updated = await getTaskAgent().updateTask(task.id, { status });
      onChanged(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update status.");
    }
  };

  const setDueDate = async (due_date: string) => {
    try {
      const updated = await getTaskAgent().updateTask(task.id, { due_date: due_date || null });
      onChanged(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the due date.");
    }
  };

  const setAssignee = async (assignee_id: string | null) => {
    try {
      const updated = await getTaskAgent().updateTask(task.id, { assignee_id });
      onChanged(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the assignee.");
    }
  };

  const toggleSubtask = async (sub: PmTask) => {
    try {
      const updated = await getTaskAgent().updateTask(sub.id, { status: sub.status === "done" ? "open" : "done" });
      setSubtasks((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this subtask.");
    }
  };

  const addSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    setAddingSubtask(true);
    try {
      const created = await getTaskAgent().createTask({
        title: newSubtaskTitle.trim(),
        parent_task_id: task.id,
        project_id: task.project_id ?? undefined,
        contact_id: task.contact_id ?? undefined,
        household_id: task.household_id ?? undefined,
        corporation_id: task.corporation_id ?? undefined,
      });
      setSubtasks((prev) => [...prev, created]);
      setNewSubtaskTitle("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add this subtask.");
    } finally {
      setAddingSubtask(false);
    }
  };

  const postComment = async () => {
    if (!commentBody.trim()) return;
    setSending(true);
    try {
      const comment = await getTaskAgent().postTaskComment(task.id, commentBody.trim());
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post this comment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={task.status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="h-8 w-[160px]"
          value={task.due_date || ""}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <StaffAssigneePicker value={task.assignee_id} onChange={setAssignee} />
      </div>

      <div className="space-y-1.5">
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          placeholder="Notes…"
        />
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subtasks</h4>
        {loadingSubtasks ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : subtasks.length > 0 ? (
          <div className="space-y-1">
            {subtasks.map((sub) => (
              <label
                key={sub.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={sub.status === "done"}
                  onChange={() => toggleSubtask(sub)}
                  className="h-3.5 w-3.5"
                />
                <span className={cn(sub.status === "done" && "text-muted-foreground line-through")}>{sub.title}</span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Input
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            placeholder="Add a subtask…"
            className="h-8 flex-1"
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
          />
          <Button size="sm" variant="outline" onClick={addSubtask} disabled={addingSubtask || !newSubtaskTitle.trim()}>
            {addingSubtask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</h4>
        {loadingComments ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-md bg-muted/50 p-2 text-sm">
                <div className="mb-0.5 text-xs font-medium text-muted-foreground">
                  {authorNames[c.author_id] || "Staff"} · {new Date(c.created_at).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            rows={2}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1"
          />
          <Button size="icon" onClick={postComment} disabled={sending || !commentBody.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
