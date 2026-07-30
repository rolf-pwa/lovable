import { useCallback, useEffect, useRef, useState } from "react";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const INTAKE_URL = `${FUNCTIONS_URL}/intake-portal`;

export interface IntakeUpload {
  fileName?: string;
  folderName?: string;
  createdAt?: string;
  classification?: {
    status?: string;
    category?: string;
    typeTag?: string;
    identifier?: string;
  } | null;
}

export interface IntakeChecklistItem {
  name: string;
  category?: string | null;
  ownerInitials?: string | null;
  subType?: string | null;
  status?: string | null;
  receivedCount?: number;
  requirement?: "required" | "optional" | null;
}

export interface IntakeManifest {
  enabled: boolean;
  ready?: boolean;
  status?: string;
  familyName?: string;
  householdName?: string;
  completion?: {
    status?: "not_started" | "in_progress" | "complete";
    expectedItems?: number;
    uploadedFiles?: number;
    percent?: number;
    lastUploadAt?: string;
    classification?: {
      pending?: number;
      filed?: number;
      needsReview?: number;
      failed?: number;
    };
    audit?: {
      track?: "PERSONAL" | "CORPORATE";
      criticalTotal?: number;
      criticalSatisfied?: number;
      total?: number;
      satisfiedTotal?: number;
      percent?: number;
      criticalComplete?: boolean;
      processing?: number;
      missingCritical?: string[];
      missingRecommended?: string[];
    } | null;
  } | null;

  checklist?: IntakeChecklistItem[];
  uploads?: IntakeUpload[];
  limits?: { maxBytes?: number; allowedTypes?: string[] } | null;
}

export interface UploadTask {
  id: string;
  name: string;
  size: number;
  progress: number;
  state: "queued" | "uploading" | "done" | "error";
  error?: string;
}

interface Options {
  /** Poll the manifest even when nothing is pending (page view). */
  active?: boolean;
}

export function useIntakeManifest(portalToken: string, options: Options = {}) {
  const { active = false } = options;
  const [manifest, setManifest] = useState<IntakeManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const uploadingRef = useRef(false);

  const load = useCallback(async () => {
    if (!portalToken) return;
    try {
      const res = await fetch(INTAKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-token": portalToken },
        body: JSON.stringify({ action: "manifest" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Unable to load your document checklist");
      setManifest(data);
    } catch {
      setManifest({ enabled: false });
    } finally {
      setLoading(false);
    }
  }, [portalToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while documents are still being classified/swept, or continuously on
  // the intake page. The agent sweeps on a ~5 minute debounce, so 60s is enough.
  useEffect(() => {
    const pending =
      (manifest?.completion?.classification?.pending ?? 0) +
      (manifest?.completion?.audit?.processing ?? 0);
    if (!manifest?.enabled) return;
    if (pending <= 0 && !active) return;
    const interval = setInterval(load, pending > 0 ? 60000 : 120000);
    return () => clearInterval(interval);
  }, [manifest, active, load]);


  const uploadOne = (file: File, taskId: string) =>
    new Promise<void>((resolve) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", INTAKE_URL);
      xhr.setRequestHeader("x-portal-token", portalToken);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, state: "uploading", progress: pct } : t)),
        );
      };
      xhr.onload = () => {
        let body: any = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        const ok = xhr.status >= 200 && xhr.status < 300 && !body?.error;
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  progress: 100,
                  state: ok ? "done" : "error",
                  error: ok ? undefined : body?.error || `Upload failed (${xhr.status})`,
                }
              : t,
          ),
        );
        resolve();
      };
      xhr.onerror = () => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, state: "error", error: "Network error" } : t,
          ),
        );
        resolve();
      };
      xhr.send(form);
    });

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return { accepted: 0, rejected: [] as string[] };
      const maxBytes = manifest?.limits?.maxBytes ?? 25 * 1024 * 1024;
      const allowed = manifest?.limits?.allowedTypes;

      const rejected: string[] = [];
      const accepted: File[] = [];
      for (const file of files) {
        if (file.size > maxBytes) {
          rejected.push(`${file.name} is larger than ${Math.round(maxBytes / 1024 / 1024)}MB`);
          continue;
        }
        if (allowed?.length && file.type && !allowed.includes(file.type)) {
          rejected.push(`${file.name} is not a supported file type`);
          continue;
        }
        accepted.push(file);
      }

      const queued: UploadTask[] = accepted.map((f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        size: f.size,
        progress: 0,
        state: "queued",
      }));
      setTasks((prev) => [...queued, ...prev].slice(0, 20));

      uploadingRef.current = true;
      // Sequential uploads keep the agent's classification queue predictable.
      for (let i = 0; i < accepted.length; i++) {
        await uploadOne(accepted[i], queued[i].id);
      }
      uploadingRef.current = false;
      await load();
      return { accepted: accepted.length, rejected };
    },
    [manifest, load],
  );

  const clearFinishedTasks = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.state !== "done"));
  }, []);

  const completion = manifest?.completion ?? null;
  const visible = Boolean(
    manifest?.enabled && manifest.ready !== false && completion?.status !== "complete",
  );
  const isComplete = completion?.status === "complete";
  const percent = Math.min(100, Math.max(0, Number(completion?.percent ?? 0)));

  return {
    manifest,
    loading,
    reload: load,
    upload,
    tasks,
    clearFinishedTasks,
    uploading: tasks.some((t) => t.state === "uploading" || t.state === "queued"),
    visible,
    isComplete,
    percent,
  };
}
