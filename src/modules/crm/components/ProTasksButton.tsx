import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { ListTodo, Loader2, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { getTaskAgent } from "@/shared/lib/agents";
import type { PmTask } from "@/shared/lib/agents";

// Tasks tagged to a pro (pm_task_collaborators.professional_id) — spans
// every household they touch, since that's the actual scope of "this pro's
// work," not just the one household this button happens to be clicked from.
export function ProTasksButton({ professionalId, professionalName }: { professionalId: string; professionalName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState<PmTask[]>([]);

  const openDialog = async () => {
    setOpen(true);
    if (loaded) return;
    setLoading(true);
    try {
      const data = await getTaskAgent().listTasks({ professional_id: professionalId });
      setTasks(data);
    } catch {
      setTasks([]);
    }
    setLoading(false);
    setLoaded(true);
  };

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={openDialog}>
        <ListTodo className="h-3 w-3 mr-1" /> Tasks
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{professionalName}'s Tasks</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No tasks tagged to {professionalName} yet.
            </p>
          ) : (
            <ul className="divide-y divide-border max-h-96 overflow-y-auto">
              {tasks.map((t) => {
                const recordLink = t.contact_id ? `/contacts/${t.contact_id}` : t.household_id ? `/households/${t.household_id}` : null;
                const isDone = t.status === "done";
                return (
                  <li key={t.id} className="py-2 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>
                        {t.title}
                      </p>
                      {t.due_date && (
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          <span>Due {format(new Date(t.due_date), "PP")}</span>
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${isDone ? "" : "bg-emerald-100 text-emerald-800 border-emerald-200"}`}>
                      {isDone ? "Done" : "Open"}
                    </Badge>
                    {recordLink && (
                      <Link to={recordLink} className="text-muted-foreground hover:text-foreground shrink-0">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
