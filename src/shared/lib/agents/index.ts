/**
 * Agent factory. UI code calls `getIntakeAgent()` / `getAuditAgent()` /
 * `getLibrarian()` and never imports a concrete provider, so swapping an
 * implementation (e.g. moving to Cloud Run) is an env-flag change.
 *
 *   VITE_INTAKE_AGENT_PROVIDER   default "edge"
 *   VITE_AUDIT_AGENT_PROVIDER    default "derived"
 *   VITE_LIBRARIAN_PROVIDER      default "vault"
 */
import type {
  IAuditAgentProvider,
  IIntakeAgentProvider,
  ILibrarianProvider,
} from "./types";
import { edgeIntakeAgent } from "./intake/edgeIntakeAgent";
import { derivedAuditAgent } from "./audit/derivedAuditAgent";
import { vaultLibrarian } from "./librarian/vaultLibrarian";

const intakeProviders: Record<string, IIntakeAgentProvider> = {
  edge: edgeIntakeAgent,
};

const auditProviders: Record<string, IAuditAgentProvider> = {
  derived: derivedAuditAgent,
};

const librarianProviders: Record<string, ILibrarianProvider> = {
  vault: vaultLibrarian,
};

function pick<T>(map: Record<string, T>, flag: string | undefined, fallback: string): T {
  return map[flag ?? fallback] ?? map[fallback];
}

export function getIntakeAgent(): IIntakeAgentProvider {
  return pick(intakeProviders, import.meta.env.VITE_INTAKE_AGENT_PROVIDER, "edge");
}

export function getAuditAgent(): IAuditAgentProvider {
  return pick(auditProviders, import.meta.env.VITE_AUDIT_AGENT_PROVIDER, "derived");
}

export function getLibrarian(): ILibrarianProvider {
  return pick(librarianProviders, import.meta.env.VITE_LIBRARIAN_PROVIDER, "vault");
}

export * from "./types";
