/**
 * Agent factory. UI code calls `getOnboardingAgent()` / `getAuditAgent()` /
 * `getLibrarian()` and never imports a concrete provider, so swapping an
 * implementation (e.g. moving to Cloud Run) is an env-flag change.
 *
 *   VITE_ONBOARDING_AGENT_PROVIDER   default "edge"
 *   VITE_AUDIT_AGENT_PROVIDER        default "derived"
 *   VITE_LIBRARIAN_PROVIDER          default "vault"
 */
import type {
  IAuditAgentProvider,
  IInvoiceAgentProvider,
  IOnboardingAgentProvider,
  ILibrarianProvider,
  ITaskAgentProvider,
} from "./types";
import { edgeOnboardingAgent } from "./onboarding/edgeOnboardingAgent";
import { inHouseOnboardingAgent } from "./onboarding/inHouseOnboardingAgent";
import { derivedAuditAgent } from "./audit/derivedAuditAgent";
import { vaultLibrarian } from "./librarian/vaultLibrarian";
import { edgeInvoiceAgent } from "./invoice/edgeInvoiceAgent";
import { edgeTaskAgent } from "./task/edgeTaskAgent";

const onboardingProviders: Record<string, IOnboardingAgentProvider> = {
  edge: edgeOnboardingAgent,
  inhouse: inHouseOnboardingAgent,
};

const auditProviders: Record<string, IAuditAgentProvider> = {
  derived: derivedAuditAgent,
};

const librarianProviders: Record<string, ILibrarianProvider> = {
  vault: vaultLibrarian,
};

const invoiceProviders: Record<string, IInvoiceAgentProvider> = {
  edge: edgeInvoiceAgent,
};

const taskProviders: Record<string, ITaskAgentProvider> = {
  edge: edgeTaskAgent,
};

function pick<T>(map: Record<string, T>, flag: string | undefined, fallback: string): T {
  return map[flag ?? fallback] ?? map[fallback];
}

export function getOnboardingAgent(): IOnboardingAgentProvider {
  return pick(
    onboardingProviders,
    import.meta.env.VITE_ONBOARDING_AGENT_PROVIDER ??
      import.meta.env.VITE_INTAKE_AGENT_PROVIDER,
    "edge",
  );
}

/** @deprecated Use getOnboardingAgent(). Kept for backward compatibility. */
export function getIntakeAgent(): IOnboardingAgentProvider {
  return getOnboardingAgent();
}

export function getAuditAgent(): IAuditAgentProvider {
  return pick(auditProviders, import.meta.env.VITE_AUDIT_AGENT_PROVIDER, "derived");
}

export function getLibrarian(): ILibrarianProvider {
  return pick(librarianProviders, import.meta.env.VITE_LIBRARIAN_PROVIDER, "vault");
}

export function getInvoiceAgent(): IInvoiceAgentProvider {
  return pick(invoiceProviders, import.meta.env.VITE_INVOICE_AGENT_PROVIDER, "edge");
}

export function getTaskAgent(): ITaskAgentProvider {
  return pick(taskProviders, import.meta.env.VITE_TASK_AGENT_PROVIDER, "edge");
}

export * from "./types";
