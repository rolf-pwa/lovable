import { useCallback, useEffect, useRef, useState } from "react";
import { getIntakeAgent } from "@/shared/lib/agents";
import type {
  IntakeAuditSummary,
  IntakeChecklistItem,
  IntakeManifest,
  IntakeUpload,
} from "@/shared/lib/agents";

export type { IntakeManifest, IntakeChecklistItem, IntakeUpload, IntakeAuditSummary };

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
  const agent = getIntakeAgent();
  const [manifest, setManifest] = useState<IntakeManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const uploadingRef = useRef(false);

  const load = useCallback(async () => {
    if (!portalToken) return;
    try {
      setManifest(await agent.getManifest({ portalToken }));
    } catch {
      setManifest({ enabled: false });
    } finally {
      setLoading(false);
    }
  }, [portalToken, agent]);

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

  const uploadOne = useCallback(
    async (file: File, taskId: string) => {
      const result = await agent.uploadDocument({ portalToken }, file, {
        onProgress: (pct) =>
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, state: "uploading", progress: pct } : t)),
          ),
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                progress: 100,
                state: result.ok ? "done" : "error",
                error: result.ok ? undefined : result.error,
              }
            : t,
        ),
      );
    },
    [agent, portalToken],
  );

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
    [manifest, load, uploadOne],
  );

  const clearFinishedTasks = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.state !== "done"));
  }, []);

  const completion = manifest?.completion ?? null;
  const audit = completion?.audit ?? null;
  const visible = Boolean(
    manifest?.enabled && manifest.ready !== false && completion?.status !== "complete",
  );
  const isComplete = completion?.status === "complete";
  // Prefer the agent's audit completeness (AI-verified documents) over raw
  // upload counts — it is what the client actually needs to finish.
  const rawPercent = audit && typeof audit.percent === "number" ? audit.percent : completion?.percent;
  const percent = Math.min(100, Math.max(0, Number(rawPercent ?? 0)));

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
    audit,
    processing: audit?.processing ?? 0,
  };
}
