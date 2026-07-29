import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, FileCheck2, Clock, AlertCircle, Inbox } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface UploadRow {
  fileName?: string;
  folderName?: string;
  createdAt?: string;
  classification?: { status?: string; category?: string; typeTag?: string } | null;
}

interface Manifest {
  enabled: boolean;
  ready?: boolean;
  status?: string;
  householdName?: string;
  completion?: {
    status?: "not_started" | "in_progress" | "complete";
    expectedItems?: number;
    uploadedFiles?: number;
    percent?: number;
    classification?: { pending?: number; filed?: number; needsReview?: number; failed?: number };
  } | null;
  uploads?: UploadRow[];
}

interface Props {
  portalToken: string;
  /** Called when intake finishes so the parent can drop the panel. */
  onComplete?: () => void;
}

const STATUS_META: Record<string, { label: string; icon: typeof Clock }> = {
  pending: { label: "Filing", icon: Clock },
  filed: { label: "Filed", icon: FileCheck2 },
  needs_review: { label: "In review", icon: AlertCircle },
  failed: { label: "Needs attention", icon: AlertCircle },
};

export function PortalIntake({ portalToken, onComplete }: Props) {
  const { toast } = useToast();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/intake-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-token": portalToken },
        body: JSON.stringify({ action: "manifest" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Unable to load your document checklist");
      setManifest(data);
      if (data?.completion?.status === "complete") onComplete?.();
    } catch {
      setManifest({ enabled: false });
    } finally {
      setLoading(false);
    }
  }, [portalToken, onComplete]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while classification is still running.
  useEffect(() => {
    const pending = manifest?.completion?.classification?.pending ?? 0;
    if (!manifest?.enabled || pending <= 0) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [manifest, load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(`${FUNCTIONS_URL}/intake-portal`, {
          method: "POST",
          headers: { "x-portal-token": portalToken },
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Upload failed for ${file.name}`);
        ok += 1;
      } catch (e) {
        toast({
          title: "Upload failed",
          description: (e as Error).message,
          variant: "destructive",
        });
      }
    }
    setUploading(false);
    if (ok) {
      toast({
        title: ok === 1 ? "Document received" : `${ok} documents received`,
        description: "We're filing it into your vault now.",
      });
      load();
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  if (loading || !manifest?.enabled || manifest.ready === false) return null;
  if (manifest.completion?.status === "complete") return null;

  const c = manifest.completion ?? {};
  const percent = Math.min(100, Math.max(0, Number(c.percent ?? 0)));
  const uploads = manifest.uploads ?? [];

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03]">
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-base flex items-center gap-2">
          <Inbox className="h-4 w-4 text-amber-500" />
          Document Intake
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Send us your documents and we'll file them into your vault automatically. This panel
          disappears once your intake is complete.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {c.uploadedFiles ?? 0} received
              {c.expectedItems ? ` of ${c.expectedItems} expected` : ""}
            </span>
            <span>{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full gap-2"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Upload documents"}
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Up to 25MB per file. Everything stays inside our secure Canadian infrastructure.
          </p>
        </div>

        {uploads.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-background/40">
            {uploads.slice(0, 6).map((u, i) => {
              const meta = STATUS_META[u.classification?.status ?? "pending"] ?? STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <li key={`${u.fileName}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{u.fileName}</p>
                    {u.folderName && (
                      <p className="truncate text-[11px] text-muted-foreground">{u.folderName}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
