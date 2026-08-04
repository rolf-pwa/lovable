import type { AgentContext, AuditState, IAuditAgentProvider } from "../types";
import { edgeOnboardingAgent } from "../onboarding/edgeOnboardingAgent";

/**
 * Interim audit agent. The real audit agent (Cloud Run) is not live yet, so we
 * derive the stage from the onboarding agent's audit summary. When the real
 * agent ships, add a sibling provider and flip `VITE_AUDIT_AGENT_PROVIDER`.
 */
export const derivedAuditAgent: IAuditAgentProvider = {
  id: "derived-from-onboarding",

  async getState(ctx: AgentContext): Promise<AuditState> {
    let manifest;
    try {
      manifest = await edgeOnboardingAgent.getManifest(ctx);
    } catch {
      return { stage: "intake", ready: false, percent: 0 };
    }

    const completion = manifest.completion ?? null;
    const audit = completion?.audit ?? null;
    const percent = Math.min(
      100,
      Math.max(0, Number(audit?.percent ?? completion?.percent ?? 0)),
    );

    if (completion?.status !== "complete") {
      return {
        stage: "intake",
        ready: false,
        percent,
        track: audit?.track,
        missingCritical: audit?.missingCritical,
      };
    }

    return {
      stage: "audit",
      ready: Boolean(audit?.criticalComplete),
      percent,
      track: audit?.track,
      missingCritical: audit?.missingCritical,
      note: "Awaiting the audit agent review.",
    };
  },
};
