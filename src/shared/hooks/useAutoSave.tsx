import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

export type AutoSaveStatus = {
  saving: boolean;
  isDirty: boolean;
  lastSavedAt: Date | null;
};

type UseAutoSaveOptions<T> = {
  /** The current value being edited. */
  data: T | null;
  /** Whether the editor is currently active (auto-save only runs when true). */
  enabled: boolean;
  /** Persists the data. Return true on success, false to keep dirty state. */
  onSave: (data: T) => Promise<boolean>;
  /** Debounce delay in ms (default 1500). */
  delay?: number;
  /**
   * If true, the hook automatically detects dirty state by JSON-comparing
   * the current `data` to a baseline captured when `enabled` flips to true.
   * If false (default), call `markDirty()` manually from your setters.
   */
  autoDetectDirty?: boolean;
};

/**
 * Debounced auto-save with dirty tracking, beforeunload guard, and a
 * `markDirty` helper to call from your field setters.
 */
export function useAutoSave<T>({ data, enabled, onSave, delay = 1500, autoDetectDirty = false }: UseAutoSaveOptions<T>) {
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<T | null>(data);
  const onSaveRef = useRef(onSave);
  const baselineRef = useRef<string | null>(null);
  const wasEnabledRef = useRef(false);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const current = dataRef.current;
    if (!current) return false;
    setSaving(true);
    try {
      const ok = await onSaveRef.current(current);
      if (ok) {
        setLastSavedAt(new Date());
        setIsDirty(false);
        if (autoDetectDirty) {
          baselineRef.current = JSON.stringify(current);
        }
      }
      return ok;
    } finally {
      setSaving(false);
    }
  }, [autoDetectDirty]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  // Capture baseline when editing begins (auto-detect mode)
  useEffect(() => {
    if (!autoDetectDirty) return;
    if (enabled && !wasEnabledRef.current) {
      baselineRef.current = data ? JSON.stringify(data) : null;
      setIsDirty(false);
    }
    wasEnabledRef.current = enabled;
  }, [enabled, data, autoDetectDirty]);

  // Auto-detect dirty by comparing data to baseline
  useEffect(() => {
    if (!autoDetectDirty || !enabled) return;
    if (!data || baselineRef.current == null) return;
    const current = JSON.stringify(data);
    if (current !== baselineRef.current) setIsDirty(true);
  }, [data, enabled, autoDetectDirty]);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsDirty(false);
    setLastSavedAt(null);
  }, []);

  // Debounced auto-save while editing and dirty
  useEffect(() => {
    if (!enabled || !isDirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, enabled, isDirty, delay, flush]);

  // Warn on unload if dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return { saving, isDirty, lastSavedAt, flush, markDirty, reset };
}

/** Compact status pill: "Saving… / Unsaved changes / Saved 3:21 PM" */
export function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  const { saving, isDirty, lastSavedAt } = status;
  let label: React.ReactNode;
  if (saving) {
    label = (
      <>
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </>
    );
  } else if (isDirty) {
    label = "Unsaved changes";
  } else if (lastSavedAt) {
    label = `Saved ${format(lastSavedAt, "h:mm:ss a")}`;
  } else {
    label = "Auto-save on";
  }
  return (
    <span className="mr-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
      {label}
    </span>
  );
}
