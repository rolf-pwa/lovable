import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppLayout } from "@/shared/components/AppLayout";
import { supabase } from "@/shared/integrations/supabase/client";
import { getTaskAgent } from "@/shared/lib/agents";
import type { PmProject, PmTask } from "@/shared/lib/agents";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { AddTaskForm } from "../components/AddTaskForm";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { cn } from "@/shared/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  open: "bg-secondary text-secondary-foreground",
  in_progress: "bg-primary/15 text-primary",
  done: "bg-emerald-500/15 text-emerald-600",
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<PmProject | null>(null);
  const [tasks, setTasks] = useState<PmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadTasks = async () => {
    if (!id) return;
    const data = await getTaskAgent().listTasks({ project_id: id });
    setTasks(data.filter((t) => !t.parent_task_id));
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      supabase.from("pm_projects").select("*").eq("id", id).maybeSingle().then(({ data }) => setProject(data as PmProject)),
      loadTasks(),
    ]).finally(() => setLoading(false));
  }, [id]);

  const handleTaskChanged = (updated: PmTask) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-muted-foreground">Project not found.</div>
      </AppLayout>
    );
  }

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div>
          <Link to="/projects" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /> Projects
          </Link>
          <h1 className="font-serif text-2xl">{project.name}</h1>
          {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            <AddTaskForm projectId={project.id} onCreated={loadTasks} />

            {tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No tasks yet. Add the first one above.</p>
            ) : (
              <div className="space-y-1">
                {[...open, ...done].map((task) => (
                  <div key={task.id} className="rounded-md border border-border">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left"
                      onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
                    >
                      {expandedId === task.id ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      {task.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className={cn("flex-1 text-sm", task.status === "done" && "text-muted-foreground line-through")}>
                        {task.title}
                      </span>
                      {task.due_date && (
                        <span className="text-xs text-muted-foreground">{task.due_date}</span>
                      )}
                      <Badge className={STATUS_BADGE[task.status] || ""} variant="secondary">
                        {task.status.replace("_", " ")}
                      </Badge>
                    </button>
                    {expandedId === task.id && (
                      <div className="px-3 pb-4">
                        <TaskDetailPanel task={task} onChanged={handleTaskChanged} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
