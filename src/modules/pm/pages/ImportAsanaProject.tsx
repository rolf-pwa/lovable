import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/shared/components/AppLayout";
import { supabase } from "@/shared/integrations/supabase/client";
import { getTaskAgent } from "@/shared/lib/agents";
import type { PmProject } from "@/shared/lib/agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { ChevronLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { EntityPicker, type EntityKind } from "../components/EntityPicker";

type Step = "url" | "preview" | "target" | "fetching" | "confirm" | "importing" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "url", label: "URL" },
  { key: "preview", label: "Preview" },
  { key: "target", label: "Target" },
  { key: "confirm", label: "Import" },
  { key: "done", label: "Done" },
];

// Collapse the internal fetching/importing sub-states onto their neighboring
// pill so the tracker only ever shows 5 stops, not 7.
const STEP_TO_PILL: Record<Step, Step> = {
  url: "url",
  preview: "preview",
  target: "target",
  fetching: "target",
  confirm: "confirm",
  importing: "confirm",
  done: "done",
};

interface PreviewInfo {
  kind: "task" | "project";
  name: string;
  topLevelCount: number;
}

interface CommitSummary {
  tasksImported: number;
  subtasksImported: number;
  commentsImported: number;
  skippedExisting: number;
  errors: { asana_gid: string; title: string; message: string }[];
}

async function invokeImport<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("asana-project-import", { body: { action, ...body } });
  if (error) {
    // supabase-js's own error.message is just "Edge Function returned a
    // non-2xx status code" -- the real {ok:false, error} body our function
    // sent lives on error.context (the raw Response), matching the same
    // parsing pmService's own edgeTaskAgent.ts already does.
    let details = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        const text = await ctx.text();
        const parsed = JSON.parse(text);
        details = parsed?.error || text || details;
      }
    } catch {
      /* keep original message */
    }
    throw new Error(details);
  }
  if (!data?.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

export default function ImportAsanaProject() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedProjectId = searchParams.get("projectId");

  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [payload, setPayload] = useState<{ tasks: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [projectMode, setProjectMode] = useState<"new" | "existing">(preselectedProjectId ? "existing" : "new");
  const [existingProjects, setExistingProjects] = useState<PmProject[]>([]);
  const [existingProjectId, setExistingProjectId] = useState<string | null>(preselectedProjectId);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");

  const [scopeKind, setScopeKind] = useState<"none" | EntityKind>("none");
  const [scopeEntity, setScopeEntity] = useState<{ id: string; label: string } | null>(null);

  const [resolvedProject, setResolvedProject] = useState<PmProject | null>(null);
  const [summary, setSummary] = useState<CommitSummary | null>(null);

  useEffect(() => {
    getTaskAgent()
      .listProjects()
      .then(setExistingProjects)
      .catch(() => {});
  }, []);

  const runPreview = async () => {
    if (!url.trim()) return;
    setError(null);
    setStep("fetching");
    try {
      const data = await invokeImport<PreviewInfo & { ok: true }>("preview", { url: url.trim() });
      setPreview(data);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve this URL.");
      setStep("url");
    }
  };

  const runFetch = async () => {
    setError(null);
    setStep("fetching");
    try {
      const data = await invokeImport<{ payload: { tasks: any[] } }>("fetch", { url: url.trim() });
      setPayload(data.payload);
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch this project from Asana.");
      setStep("target");
    }
  };

  // Resolves (creating if needed) a concrete pm_projects row + its scope,
  // then advances to the fetch step. The import function itself never
  // creates a project -- this reuses the same createProject validation
  // Projects.tsx's own "New project" dialog already goes through.
  const resolveTargetAndFetch = async () => {
    setError(null);
    try {
      let project: PmProject;
      if (projectMode === "existing") {
        const existing = existingProjects.find((p) => p.id === existingProjectId);
        if (!existing) {
          setError("Choose an existing project.");
          return;
        }
        project = existing;
      } else {
        if (!newProjectName.trim()) {
          setError("Give the new project a name.");
          return;
        }
        project = await getTaskAgent().createProject({
          name: newProjectName.trim(),
          description: newProjectDescription.trim() || undefined,
          household_id: scopeKind === "household" ? scopeEntity?.id : undefined,
          contact_id: scopeKind === "contact" ? scopeEntity?.id : undefined,
          family_id: scopeKind === "family" ? scopeEntity?.id : undefined,
          corporation_id: scopeKind === "corporation" ? scopeEntity?.id : undefined,
        });
      }
      setResolvedProject(project);
      await runFetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve the target project.");
    }
  };

  const runCommit = async () => {
    if (!resolvedProject || !payload) return;
    setError(null);
    setStep("importing");
    try {
      const data = await invokeImport<{ summary: CommitSummary }>("commit", {
        project_id: resolvedProject.id,
        household_id: resolvedProject.household_id,
        contact_id: resolvedProject.contact_id,
        corporation_id: resolvedProject.corporation_id,
        family_id: resolvedProject.family_id,
        payload,
      });
      setSummary(data.summary);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setStep("confirm");
    }
  };

  const pillIdx = STEPS.findIndex((s) => s.key === STEP_TO_PILL[step]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <Link to="/projects" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /> Projects
          </Link>
          <h1 className="font-serif text-2xl">Import from Asana</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One deliberate, on-demand pull of a single task or project — tasks, subtasks, and comments — into the in-house PM system. Not a live sync.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => {
            const isActive = i <= pillIdx;
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-6 ${isActive ? "bg-primary" : "bg-border"}`} />}
                <div
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {step === "url" && (
          <Card>
            <CardHeader>
              <CardTitle>Asana task or project URL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="asana-url">URL</Label>
                <Input
                  id="asana-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://app.asana.com/0/…/…"
                />
              </div>
              <Button onClick={runPreview} disabled={!url.trim()}>
                Preview
              </Button>
            </CardContent>
          </Card>
        )}

        {(step === "fetching" && !preview) && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "preview" && preview && (
          <Card>
            <CardHeader>
              <CardTitle>Does this look right?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                This is a <strong>{preview.kind}</strong> named <strong>{preview.name}</strong> with{" "}
                <strong>{preview.topLevelCount}</strong> top-level task{preview.topLevelCount === 1 ? "" : "s"}.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setPreview(null); setStep("url"); }}>
                  Try a different URL
                </Button>
                <Button onClick={() => setStep("target")}>Looks right, continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "target" && (
          <Card>
            <CardHeader>
              <CardTitle>Where should this go?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Project</Label>
                <RadioGroup value={projectMode} onValueChange={(v) => setProjectMode(v as "new" | "existing")}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="new" id="mode-new" />
                    <Label htmlFor="mode-new" className="font-normal">Create a new project</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="existing" id="mode-existing" />
                    <Label htmlFor="mode-existing" className="font-normal">Add to an existing project</Label>
                  </div>
                </RadioGroup>
              </div>

              {projectMode === "new" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="new-proj-name">Name</Label>
                    <Input
                      id="new-proj-name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder={preview?.name || "Project name"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-proj-desc">Description</Label>
                    <Textarea
                      id="new-proj-desc"
                      rows={2}
                      value={newProjectDescription}
                      onChange={(e) => setNewProjectDescription(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scope (optional)</Label>
                    <RadioGroup value={scopeKind} onValueChange={(v) => { setScopeKind(v as typeof scopeKind); setScopeEntity(null); }}>
                      {(["none", "household", "contact", "family", "corporation"] as const).map((kind) => (
                        <div key={kind} className="flex items-center gap-2">
                          <RadioGroupItem value={kind} id={`scope-${kind}`} />
                          <Label htmlFor={`scope-${kind}`} className="font-normal capitalize">
                            {kind === "none" ? "None — firm-internal / operational project" : kind}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                    {scopeKind !== "none" && (
                      <EntityPicker kind={scopeKind} value={scopeEntity} onChange={setScopeEntity} />
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>Existing project</Label>
                  <Select value={existingProjectId || undefined} onValueChange={setExistingProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    New tasks will inherit this project's existing scope.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep("preview")}>Back</Button>
                <Button
                  onClick={resolveTargetAndFetch}
                  disabled={projectMode === "new" ? (scopeKind !== "none" && !scopeEntity) : !existingProjectId}
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "confirm" && payload && resolvedProject && (
          <Card>
            <CardHeader>
              <CardTitle>Ready to import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1 text-sm">
                <p>
                  <strong>{payload.tasks.length}</strong> top-level task{payload.tasks.length === 1 ? "" : "s"},{" "}
                  <strong>{payload.tasks.reduce((n, t) => n + (t.subtasks?.length || 0), 0)}</strong> subtask
                  {payload.tasks.reduce((n, t) => n + (t.subtasks?.length || 0), 0) === 1 ? "" : "s"},{" "}
                  <strong>
                    {payload.tasks.reduce(
                      (n, t) => n + (t.comments?.length || 0) + (t.subtasks || []).reduce((m: number, s: any) => m + (s.comments?.length || 0), 0),
                      0,
                    )}
                  </strong>{" "}
                  comment(s).
                </p>
                <p>
                  Target: <strong>{resolvedProject.name}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep("target")}>Back</Button>
                <Button onClick={runCommit}>Import</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "importing" && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "done" && summary && resolvedProject && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Import complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-1 text-sm">
                <li>{summary.tasksImported} tasks imported</li>
                <li>{summary.subtasksImported} subtasks imported</li>
                <li>{summary.commentsImported} comments imported</li>
                <li>{summary.skippedExisting} already imported, skipped</li>
              </ul>
              {summary.errors.length > 0 && (
                <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium text-destructive">{summary.errors.length} error(s):</p>
                  <ul className="list-inside list-disc text-destructive">
                    {summary.errors.map((e, i) => (
                      <li key={i}>{e.title}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button onClick={() => navigate(`/projects/${resolvedProject.id}`)}>View project</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
