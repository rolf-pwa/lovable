import type {
  AgentContext,
  IOnboardingAgentProvider,
  IntakeManifest,
  UploadHandlers,
  UploadResult,
} from "../types";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ONBOARDING_URL = `${FUNCTIONS_URL}/intake-portal`;

/**
 * In-house Onboarding Agent provider.
 *
 * Calls the same `intake-portal` edge function, but the function is expected to
 * run in `INTAKE_AGENT_MODE=inhouse`, building the manifest from local tables
 * and classifying uploads with Vertex AI instead of proxying to an external
 * service.
 */
export const inHouseOnboardingAgent: IOnboardingAgentProvider = {
  id: "onboarding-portal-inhouse",

  async getManifest({ portalToken }: AgentContext): Promise<IntakeManifest> {
    if (!portalToken) return { enabled: false };
    const res = await fetch(ONBOARDING_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-portal-token": portalToken },
      body: JSON.stringify({ action: "manifest" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Unable to load your document checklist");
    return data as IntakeManifest;
  },

  uploadDocument({ portalToken }: AgentContext, file: File, handlers?: UploadHandlers) {
    return new Promise<UploadResult>((resolve) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", ONBOARDING_URL);
      xhr.setRequestHeader("x-portal-token", portalToken);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        handlers?.onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON response */
        }
        const ok = xhr.status >= 200 && xhr.status < 300 && !body?.error;
        resolve({
          ok,
          error: ok ? undefined : (body?.error as string) || `Upload failed (${xhr.status})`,
        });
      };
      xhr.onerror = () => resolve({ ok: false, error: "Network error" });
      xhr.send(form);
    });
  },
};
