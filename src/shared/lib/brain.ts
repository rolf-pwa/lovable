// Client wrapper for the Second Brain — mirrors the shape of other
// supabase.functions.invoke() wrappers in this codebase. Tables are cast
// `as any` like every other pre-codegen table (see KnowledgeBase.tsx),
// since src/integrations/supabase/types.ts hasn't been regenerated for
// the brain_* tables yet.
import { supabase } from "@/shared/integrations/supabase/client";

export type BrainDocType = "note" | "kb_entry" | "recap" | "vault_file" | "upload" | "link" | "transcript";
export type BrainIndexStatus = "pending" | "processing" | "ready" | "error" | "skipped";
export type BrainEntityType = "contact" | "family" | "household" | "corporation" | "professional" | "lead";

export interface BrainDocument {
  id: string;
  title: string;
  body: string | null;
  summary: string | null;
  doc_type: BrainDocType;
  source_system: string;
  source_url: string | null;
  tags: string[];
  pinned: boolean;
  is_active: boolean;
  index_status: BrainIndexStatus;
  index_error: string | null;
  chunk_count: number;
  occurred_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainEntityLink {
  id: string;
  document_id: string;
  entity_type: BrainEntityType;
  entity_id: string;
  link_source: "manual" | "inherited" | "ai";
}

function brainDocuments() {
  return supabase.from("brain_documents" as any) as any;
}

function brainEntityLinks() {
  return supabase.from("brain_entity_links" as any) as any;
}

export async function listBrainDocuments(opts?: { search?: string; docType?: BrainDocType | "all" }) {
  let query = brainDocuments().select("*").eq("is_active", true).order("pinned", { ascending: false }).order(
    "created_at",
    { ascending: false },
  );
  if (opts?.docType && opts.docType !== "all") query = query.eq("doc_type", opts.docType);
  if (opts?.search) query = query.or(`title.ilike.%${opts.search}%,body.ilike.%${opts.search}%`);
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return (data || []) as BrainDocument[];
}

export async function getBrainDocument(id: string) {
  const { data, error } = await brainDocuments().select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as BrainDocument | null;
}

export async function getBrainEntityLinks(documentId: string) {
  const { data, error } = await brainEntityLinks().select("*").eq("document_id", documentId);
  if (error) throw error;
  return (data || []) as BrainEntityLink[];
}

export async function linkBrainEntity(documentId: string, entityType: BrainEntityType, entityId: string) {
  const { error } = await brainEntityLinks().insert({
    document_id: documentId,
    entity_type: entityType,
    entity_id: entityId,
    link_source: "manual",
  });
  if (error) throw error;
}

export async function unlinkBrainEntity(linkId: string) {
  const { error } = await brainEntityLinks().delete().eq("id", linkId);
  if (error) throw error;
}

/** Triggers (re-)indexing for a document. Fire-and-forget is fine — the scheduled drain is the guarantee. */
export async function requestIndexing(documentId: string) {
  const { error } = await supabase.functions.invoke("brain-index", {
    body: { action: "indexDocument", documentId },
  });
  if (error) throw error;
}

export async function captureBrainNote(input: {
  title: string;
  body: string;
  tags?: string[];
  createdBy?: string | null;
}) {
  const { data, error } = await brainDocuments()
    .insert({
      title: input.title,
      body: input.body,
      doc_type: "note",
      source_system: "manual",
      tags: input.tags || [],
      created_by: input.createdBy || null,
      index_status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  const id = data?.id as string;
  // Best-effort: don't block capture on indexing succeeding immediately.
  requestIndexing(id).catch(() => {});
  return id;
}

export async function updateBrainDocument(
  id: string,
  patch: Partial<Pick<BrainDocument, "title" | "body" | "tags" | "pinned" | "is_active">>,
) {
  const { error } = await brainDocuments().update({ ...patch, index_status: patch.body ? "pending" : undefined }).eq(
    "id",
    id,
  );
  if (error) throw error;
  if (patch.body) requestIndexing(id).catch(() => {});
}

export async function syncKnowledgeBaseToBrain() {
  const { data, error } = await supabase.functions.invoke("brain-index", { body: { action: "syncKnowledgeBase" } });
  if (error) throw error;
  return data as { ok: boolean; synced: number };
}

export async function syncRecapsToBrain() {
  const { data, error } = await supabase.functions.invoke("brain-index", { body: { action: "syncRecaps" } });
  if (error) throw error;
  return data as { ok: boolean; synced: number };
}

export interface BrainCitation {
  n: number;
  documentId: string;
  chunkId: string;
  title: string;
  docType: string;
  sourceUrl: string | null;
  similarity: number;
  snippet: string;
}

export async function searchBrain(query: string, opts?: { entityType?: BrainEntityType; entityId?: string }) {
  const { data, error } = await supabase.functions.invoke("brain-search", {
    body: { action: "search", query, ...opts },
  });
  if (error) throw error;
  return (data?.citations || []) as BrainCitation[];
}

export async function askBrain(query: string, opts?: { entityType?: BrainEntityType; entityId?: string }) {
  const { data, error } = await supabase.functions.invoke("brain-search", {
    body: { action: "ask", query, ...opts },
  });
  if (error) throw error;
  return data as { ok: boolean; text: string; citations: BrainCitation[] };
}

/** Opt-in: fetches and indexes a single vault file's text into the Second Brain. */
export async function indexVaultFile(input: {
  driveId: string;
  name: string;
  mimeType?: string;
  contactId?: string;
  householdId?: string;
}) {
  const { data, error } = await supabase.functions.invoke("brain-index", {
    body: { action: "indexVaultFile", ...input },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Could not index this file.");
  return data as { ok: boolean; status: string; chunkCount: number; documentId: string };
}
