import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Circle, MessageSquare, Plus, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { FN, proFetch } from "./ProPortalShell";

interface Task {
  gid: string;
  name: string;
  notes: string;
  completed: boolean;
  due_on: string | null;
  section: string | null;
  num_subtasks: number;
  modified_at: string;
}
interface Story { gid: string; text: string; created_at: string; author: string }

interface Props {
  scopeType: "family" | "household" | "contact";
  scopeId: string;
}

export default function ProTasksPanel({ scopeType, scopeId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stories, setStories] = useState<Record<string, Story[]>>({});
  const [composer, setComposer] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(FN.tasks, proFetch({ action: "list", scope_type: scopeType, scope_id: scopeId }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTasks(data.tasks || []);
    } catch (e: any) {
      toast.error(e.message || "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, [scopeType, scopeId]);

  useEffect(() => { load(); }, [load]);

  async function toggleExpand(t: Task) {
    if (expanded === t.gid) { setExpanded(null); return; }
    setExpanded(t.gid);
    if (!stories[t.gid]) {
      try {
        const res = await fetch(FN.tasks, proFetch({ action: "stories", task_gid: t.gid }));
        const data = await res.json();
        if (res.ok) setStories((s) => ({ ...s, [t.gid]: data.stories || [] }));
      } catch {/* noop */}
    }
  }

  async function comment(t: Task) {
    const text = (composer[t.gid] || "").trim();
    if (!text) return;
    setSending(t.gid);
    try {
      const res = await fetch(FN.tasks, proFetch({ action: "comment", task_gid: t.gid, text }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setComposer((c) => ({ ...c, [t.gid]: "" }));
      const s = await fetch(FN.tasks, proFetch({ action: "stories", task_gid: t.gid }));
      const sd = await s.json();
      if (s.ok) setStories((prev) => ({ ...prev, [t.gid]: sd.stories || [] }));
    } catch (e: any) {
      toast.error(e.message || "Comment failed");
    } finally {
      setSending(null);
    }
  }

  async function complete(t: Task) {
    try {
      const res = await fetch(FN.tasks, proFetch({ action: "complete", task_gid: t.gid, completed: !t.completed }));
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.map((x) => x.gid === t.gid ? { ...x, completed: !t.completed } : x));
      toast.success(t.completed ? "Reopened" : "Marked complete");
    } catch {
      toast.error("Could not update task");
    }
  }

  async function createTask() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(FN.tasks, proFetch({ action: "create", scope_type: scopeType, scope_id: scopeId, title: newTitle.trim(), notes: newNotes.trim() }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Task opened — ProsperWise notified");
      setNewOpen(false);
      setNewTitle("");
      setNewNotes("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Could not create task");
    } finally {
      setCreating(false);
    }
  }

  const filtered = tasks.filter((t) => tab === "open" ? !t.completed : t.completed);

  return (
    <Card className="border-amber-500/20">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-serif text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-amber-500" /> Workflow Tasks
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border/60 p-0.5 text-xs">
              <button
                onClick={() => setTab("open")}
                className={`px-3 py-1 rounded ${tab === "open" ? "bg-amber-500 text-slate-950" : "text-muted-foreground hover:text-foreground"}`}
              >Open</button>
              <button
                onClick={() => setTab("done")}
                className={`px-3 py-1 rounded ${tab === "done" ? "bg-amber-500 text-slate-950" : "text-muted-foreground hover:text-foreground"}`}
              >Done</button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setNewOpen((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New task
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {newOpen && (
          <div className="space-y-2 border border-amber-500/25 bg-amber-500/[0.03] rounded-md p-3">
            <Input
              placeholder="Task title (e.g. Draft trust amendment)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Textarea
              rows={3}
              placeholder="Context / next steps (avoid SIN, account numbers, balances)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={createTask} disabled={creating || !newTitle.trim()} className="bg-amber-500 hover:bg-amber-600 text-slate-950">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Open task"}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading tasks…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            {tab === "open" ? "No open tasks assigned to you here yet." : "No completed tasks."}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((t) => {
              const isExpanded = expanded === t.gid;
              return (
                <li key={t.gid} className="border border-border/60 rounded-md overflow-hidden bg-card">
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    <button
                      onClick={() => complete(t)}
                      className="mt-0.5 text-muted-foreground hover:text-amber-500 transition-colors"
                      title={t.completed ? "Reopen" : "Mark complete"}
                    >
                      {t.completed ? <CheckCircle2 className="h-4 w-4 text-amber-500" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <button onClick={() => toggleExpand(t)} className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${t.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {t.name}
                        </span>
                        {t.section && (
                          <Badge variant="outline" className="text-[10px]">{t.section}</Badge>
                        )}
                        {t.due_on && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            due {format(new Date(t.due_on), "MMM d")}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Updated {formatDistanceToNow(new Date(t.modified_at), { addSuffix: true })}
                      </div>
                    </button>
                    <button onClick={() => toggleExpand(t)} className="text-muted-foreground shrink-0">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/20 px-3 py-3 space-y-3">
                      {t.notes && (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">{t.notes}</div>
                      )}
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> Comments
                        </div>
                        {(stories[t.gid] || []).length === 0 ? (
                          <div className="text-xs text-muted-foreground italic">No comments yet.</div>
                        ) : (
                          <ul className="space-y-1.5">
                            {(stories[t.gid] || []).map((s) => (
                              <li key={s.gid} className="text-xs bg-card border border-border/60 rounded px-2 py-1.5">
                                <div className="whitespace-pre-wrap text-foreground">{s.text}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {s.author} · {format(new Date(s.created_at), "PP p")}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Textarea
                          rows={2}
                          placeholder="Add a comment…"
                          value={composer[t.gid] || ""}
                          onChange={(e) => setComposer((c) => ({ ...c, [t.gid]: e.target.value }))}
                          className="text-xs"
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => comment(t)}
                            disabled={sending === t.gid || !(composer[t.gid] || "").trim()}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950"
                          >
                            {sending === t.gid ? <Loader2 className="h-3 w-3 animate-spin" /> : "Post"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
