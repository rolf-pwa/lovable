import { supabase } from "@/shared/integrations/supabase/client";

const MAX_SOURCE_TITLE = 120;
const MAX_SOURCE_TEXT = 20000;
const MAX_SOURCE_URL = 2000;

export type CharterSourceKind = "statement" | "stabilization_session" | "meeting_transcript" | "link" | "note";
export type CharterSourceInputMode = "upload" | "text" | "url";

export type CharterDraftStatus = "draft" | "generated" | "ratified";

export interface CharterSourceRecord {
  id: string;
  charter_id: string | null;
  contact_id: string;
  source_kind: CharterSourceKind;
  input_mode: CharterSourceInputMode;
  title: string;
  source_url: string | null;
  content_text: string | null;
  extracted_text: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  import_origin: string;
  external_file_id: string | null;
  external_modified_at: string | null;
  external_folder_id: string | null;
  sync_error: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DraftCharterPayload {
  contactId: string;
  charterId?: string;
  sources: Array<{
    sourceKind: CharterSourceKind;
    title: string;
    inputMode: CharterSourceInputMode;
    contentText?: string;
    sourceUrl?: string;
    storagePath?: string;
    fileName?: string;
    mimeType?: string;
    importOrigin?: string;
    externalFileId?: string;
    externalModifiedAt?: string;
    externalFolderId?: string;
    syncError?: string;
  }>;
}

export function sanitizeSourceTitle(value: string) {
  return value.trim().slice(0, MAX_SOURCE_TITLE) || "Untitled source";
}

export function sanitizeSourceText(value: string) {
  return value.trim().slice(0, MAX_SOURCE_TEXT);
}

export function sanitizeSourceUrl(value: string) {
  return value.trim().slice(0, MAX_SOURCE_URL);
}

export function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

export function isValidSourceUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function uploadCharterSourceFile(contactId: string, file: File) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  const safeName = sanitizeFileName(file.name || `charter-source.${ext || "pdf"}`);
  const path = `${contactId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from("charter-source-uploads")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });

  if (error) {
    throw new Error(error.message);
  }

  return path;
}

export async function draftSovereigntyCharter(payload: DraftCharterPayload) {
  const { data, error } = await supabase.functions.invoke("generate-charter-draft", {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || "Failed to generate charter draft");
  }

  if (data?.ok === false) {
    throw new Error(data.error || "Failed to generate charter draft");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}