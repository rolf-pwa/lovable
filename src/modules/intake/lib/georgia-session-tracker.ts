// Lightweight client tracker for Georgia chat sessions.
// Patches the existing georgia_session_starts row created on chat open
// with funnel + last-activity data, including a final beacon on tab close.

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ENDPOINT = `${FUNCTIONS_URL}/georgia-session-update`;

export type GeorgiaPhase = "chat" | "lead_capture" | "complete";

export interface SessionUpdate {
  message_count?: number;
  reached_lead_capture?: boolean;
  lead_captured?: boolean;
  final_phase?: GeorgiaPhase;
  ended?: boolean;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const PENDING: SessionUpdate = {};
let CURRENT_KEY: string | null = null;

function flushPending() {
  if (!CURRENT_KEY || Object.keys(PENDING).length === 0) return;
  const body = JSON.stringify({ session_key: CURRENT_KEY, ...PENDING });
  // Reset BEFORE the network call so concurrent updates aren't lost.
  for (const k of Object.keys(PENDING)) delete (PENDING as Record<string, unknown>)[k];

  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // best-effort; analytics not critical
  });
}

export function bindGeorgiaSession(sessionKey: string) {
  CURRENT_KEY = sessionKey;
}

export function trackSessionUpdate(update: SessionUpdate) {
  if (!CURRENT_KEY) return;
  Object.assign(PENDING, update);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushPending, 800);
}

/**
 * Call once after the session row has been inserted. Wires up a
 * page-close beacon so we record the final state even when the
 * visitor closes the tab without completing lead capture.
 */
export function attachExitBeacon(getState: () => SessionUpdate) {
  const sendBeacon = () => {
    if (!CURRENT_KEY) return;
    const payload = JSON.stringify({
      session_key: CURRENT_KEY,
      ...getState(),
      ended: true,
    });
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon?.(ENDPOINT, blob);
      if (!ok) {
        // Fallback to keepalive fetch
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") sendBeacon();
  };

  window.addEventListener("pagehide", sendBeacon);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("pagehide", sendBeacon);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
