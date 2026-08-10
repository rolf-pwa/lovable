// Single retrieval primitive for the Second Brain, shared by brain-search
// (the ⌘K palette / Ask tab) and the staff Vertex AI assistant's optional
// `useBrain` context injection. Keeping this in one place means both
// surfaces stay in sync and neither duplicates the RAG logic.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embedTexts, type ServiceAccountKey } from "./vertex-ai.ts";

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

export interface BrainRetrievalResult {
  block: string;
  citations: BrainCitation[];
  chunkIds: string[];
}

interface RawMatch {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  heading: string | null;
  similarity: number;
  title: string;
  doc_type: string;
  source_system: string;
  source_url: string | null;
  occurred_at: string | null;
}

export interface RetrieveOptions {
  matchCount?: number;
  threshold?: number;
  docTypes?: string[];
  entityType?: string;
  entityId?: string;
  maxChars?: number;
  maxPerDocument?: number;
}

async function vectorSearch(
  db: SupabaseClient,
  sa: ServiceAccountKey,
  query: string,
  opts: RetrieveOptions,
): Promise<RawMatch[]> {
  const [queryEmbedding] = await embedTexts(sa, [{ content: query }], "RETRIEVAL_QUERY");
  const { data, error } = await db.rpc("match_brain_chunks", {
    query_embedding: queryEmbedding,
    match_count: opts.matchCount ?? 12,
    similarity_threshold: opts.threshold ?? 0.35,
    filter_doc_types: opts.docTypes ?? null,
    filter_entity_type: opts.entityType ?? null,
    filter_entity_id: opts.entityId ?? null,
  });
  if (error) throw new Error(`match_brain_chunks failed: ${error.message}`);
  return (data || []) as RawMatch[];
}

/**
 * Keyword (tsvector) search over the same chunks, for the terms embeddings
 * tend to smear — proper nouns, account numbers. Skipped when an entity
 * filter is set (match_brain_chunks already handles that server-side, and
 * PostgREST can't easily express the same EXISTS filter here).
 */
async function keywordSearch(
  db: SupabaseClient,
  query: string,
  opts: RetrieveOptions,
): Promise<RawMatch[]> {
  if (opts.entityType) return [];
  let q = db
    .from("brain_chunks")
    .select(
      "id, document_id, chunk_index, content, heading, brain_documents!inner(title, doc_type, source_system, source_url, occurred_at, is_active)",
    )
    .eq("brain_documents.is_active", true)
    .textSearch("content_tsv", query, { type: "websearch" })
    .limit(opts.matchCount ?? 12);
  if (opts.docTypes?.length) q = q.in("brain_documents.doc_type", opts.docTypes);

  const { data, error } = await q;
  if (error) {
    console.warn("[brain-retrieval] keyword search failed, continuing with vector-only:", error.message);
    return [];
  }
  return (data || []).map((row: any) => ({
    chunk_id: row.id,
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    content: row.content,
    heading: row.heading,
    similarity: 0,
    title: row.brain_documents.title,
    doc_type: row.brain_documents.doc_type,
    source_system: row.brain_documents.source_system,
    source_url: row.brain_documents.source_url,
    occurred_at: row.brain_documents.occurred_at,
  }));
}

/** Reciprocal rank fusion: chunks ranked highly by either search count more. */
function fuseResults(vectorMatches: RawMatch[], keywordMatches: RawMatch[]): RawMatch[] {
  const scores = new Map<string, { match: RawMatch; score: number }>();
  const K = 60;
  vectorMatches.forEach((m, i) => {
    scores.set(m.chunk_id, { match: m, score: 1 / (K + i) });
  });
  keywordMatches.forEach((m, i) => {
    const existing = scores.get(m.chunk_id);
    const bump = 1 / (K + i);
    if (existing) existing.score += bump;
    else scores.set(m.chunk_id, { match: m, score: bump });
  });
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map((s) => s.match);
}

export async function retrieveBrainContext(
  db: SupabaseClient,
  sa: ServiceAccountKey,
  query: string,
  opts: RetrieveOptions = {},
): Promise<BrainRetrievalResult> {
  const maxChars = opts.maxChars ?? 8000;
  const maxPerDocument = opts.maxPerDocument ?? 3;

  const [vectorMatches, keywordMatches] = await Promise.all([
    vectorSearch(db, sa, query, opts),
    keywordSearch(db, query, opts),
  ]);
  const fused = fuseResults(vectorMatches, keywordMatches);

  const perDocCount = new Map<string, number>();
  const capped = fused.filter((m) => {
    const count = perDocCount.get(m.document_id) || 0;
    if (count >= maxPerDocument) return false;
    perDocCount.set(m.document_id, count + 1);
    return true;
  });

  const citations: BrainCitation[] = [];
  const lines: string[] = [];
  let usedChars = 0;

  for (const m of capped) {
    const dateStr = m.occurred_at ? `, ${new Date(m.occurred_at).toISOString().slice(0, 10)}` : "";
    const n = citations.length + 1;
    const entry = `[^${n}] ${m.title} (${m.doc_type}${dateStr})\n${m.content}`;
    if (usedChars + entry.length > maxChars && citations.length > 0) break;
    usedChars += entry.length;
    citations.push({
      n,
      documentId: m.document_id,
      chunkId: m.chunk_id,
      title: m.title,
      docType: m.doc_type,
      sourceUrl: m.source_url,
      similarity: m.similarity,
      snippet: m.content.slice(0, 240),
    });
    lines.push(entry);
  }

  return {
    block: lines.length ? `## Second Brain Context\n\n${lines.join("\n\n")}` : "",
    citations,
    chunkIds: citations.map((c) => c.chunkId),
  };
}
