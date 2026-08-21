import { useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { ListTodo, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface Task {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  memberships?: { section?: { name?: string } }[];
}

// Tasks tagged to a pro (task_collaborators.professional_id) — spans every
// household they touch, since that's the actual scope of "this pro's work,"
// not just the one household this button happens to be clicked from.
export function ProTasksButton({ professionalId, professionalName }: { professionalId: string; professionalName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);

  const openDialog = async () => {
    setOpen(true);
    if (loaded) return;
    setLoading(true);
    const res = await supabase.functions.invoke("asana-service", {
      body: { action: "getTaggedTasks", professional_id: professionalId },
    });
    setTasks(res.error || res.data?.error ? [] : (res.data?.data || []));
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
              {tasks.map((t) => (
                <li key={t.gid} className="py-2 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>
                      {t.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      {t.memberships?.[0]?.section?.name && <span>{t.memberships[0].section.name}</span>}
                      {t.due_on && <span>· Due {format(new Date(t.due_on), "PP")}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${t.completed ? "" : "bg-emerald-100 text-emerald-800 border-emerald-200"}`}>
                    {t.completed ? "Done" : "Open"}
                  </Badge>
                  <a
                    href={`https://app.asana.com/0/0/${t.gid}/f`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
