/**
 * Agent adapter contracts (Phase 2 of the modular monolith).
 *
 * The UI never talks to an agent directly — it talks to one of these
 * interfaces. Today's implementations proxy our edge functions; tomorrow they
 * can point at Cloud Run without any UI change.
 */

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

export interface IntakeAuditSummary {
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
    audit?: IntakeAuditSummary | null;
  } | null;
  checklist?: IntakeChecklistItem[];
  uploads?: IntakeUpload[];
  limits?: { maxBytes?: number; allowedTypes?: string[] } | null;
}

/** Portal-scoped credentials handed to an agent call. */
export interface AgentContext {
  portalToken: string;
}

export interface UploadHandlers {
  onProgress?: (percent: number) => void;
}

export interface UploadResult {
  ok: boolean;
  error?: string;
}

export interface IOnboardingAgentProvider {
  /** Stable id for logging/diagnostics. */
  readonly id: string;
  getManifest(ctx: AgentContext): Promise<IntakeManifest>;
  uploadDocument(ctx: AgentContext, file: File, handlers?: UploadHandlers): Promise<UploadResult>;
}

/** @deprecated Use IOnboardingAgentProvider. Kept for backward compatibility. */
export type IIntakeAgentProvider = IOnboardingAgentProvider;

/** Stage of the staged Onboarding -> Audit -> VFO flow. */
export type AuditStage = "intake" | "audit" | "vfo";

export interface AuditState {
  stage: AuditStage;
  /** True once the audit agent has produced a reviewable result. */
  ready: boolean;
  percent: number;
  track?: "PERSONAL" | "CORPORATE";
  missingCritical?: string[];
  note?: string;
}

export interface IAuditAgentProvider {
  readonly id: string;
  getState(ctx: AgentContext): Promise<AuditState>;
}

export interface LibrarianEntry {
  id: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  modifiedAt?: string | null;
  isFolder?: boolean;
}

export interface ILibrarianProvider {
  readonly id: string;
  listFolder(ctx: AgentContext, folderId?: string): Promise<LibrarianEntry[]>;
  getDownloadUrl(ctx: AgentContext, fileId: string): Promise<string | null>;
}

/** Result of an AI invoice draft. Nothing is sent until an advisor approves. */
export interface InvoiceDraftResult {
  ok: boolean;
  invoiceId: string;
  contact?: { id: string; full_name: string } | null;
  total?: number;
  lineCount?: number;
  needsContact?: boolean;
}

export interface IInvoiceAgentProvider {
  readonly id: string;
  /** Drafts an invoice from a plain-language prompt (status stays `draft`). */
  draftInvoice(prompt: string): Promise<InvoiceDraftResult>;
  /** Advisor-approved send: pushes to Square and emails the client. */
  sendInvoice(invoiceId: string): Promise<{ ok: boolean; publicUrl?: string; status?: string }>;
  refreshInvoice(invoiceId: string): Promise<{ ok: boolean; status?: string }>;
  cancelInvoice(invoiceId: string): Promise<{ ok: boolean }>;
  syncService(serviceId: string): Promise<{ ok: boolean; squareId?: string }>;
  getStatus(): Promise<{ configured: boolean; environment: string }>;
}
