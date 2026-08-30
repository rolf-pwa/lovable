import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/shared/components/AppLayout";
import { getTaskAgent } from "@/shared/lib/agents";
import type { PmProject } from "@/shared/lib/agents";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Loader2, Plus, FolderKanban } from "lucide-react";
import { NewProjectDialog } from "../components/NewProjectDialog";

export default function Projects() {
  const [projects, setProjects] = useState<PmProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      setProjects(await getTaskAgent().listProjects());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl">Projects</h1>
            <p className="text-sm text-muted-foreground">Tasks and initiatives, tracked in-house.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New project
          </Button>
        </div>

        <Card>
          <CardContent className="p-6">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : projects.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No projects yet. Create your first one.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
                      <Badge variant="secondary" className="ml-auto capitalize">
                        {p.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="font-serif text-base">{p.name}</div>
                    {p.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(id) => navigate(`/projects/${id}`)} />
    </AppLayout>
  );
}
