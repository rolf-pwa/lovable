-- Second Brain (Phase 1): staff-only semantic knowledge layer.
-- Deliberately separate from public.knowledge_base, which is read by
-- client-facing edge functions (portal-assistant, discovery-assistant,
-- vfo-onboarding) via a service-role client. Nothing in this migration
-- is reachable by anon or by those client-facing functions.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================
-- brain_documents: one row per source object (provenance + citation unit)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brain_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  summary TEXT,
  doc_type TEXT NOT NULL DEFAULT 'note',
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_table TEXT,
  source_record_id UUID,
  source_url TEXT,
  external_id TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'internal',
  tags TEXT[] NOT NULL DEFAULT '{}',
  pinned BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  content_hash TEXT,
  index_status TEXT NOT NULL DEFAULT 'pending',
  index_error TEXT,
  indexed_at TIMESTAMP WITH TIME ZONE,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  occurred_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT brain_documents_doc_type_check CHECK (
    doc_type IN ('note', 'kb_entry', 'recap', 'vault_file', 'upload', 'link', 'transcript')
  ),
  CONSTRAINT brain_documents_source_system_check CHECK (
    source_system IN ('manual', 'knowledge_base', 'daily_recap', 'vault', 'upload')
  ),
  CONSTRAINT brain_documents_sensitivity_check CHECK (
    sensitivity IN ('internal', 'client_shareable', 'restricted')
  ),
  CONSTRAINT brain_documents_index_status_check CHECK (
    index_status IN ('pending', 'processing', 'ready', 'error', 'skipped')
  )
);

-- Idempotent sync target: one brain document per (source_system, source_record_id).
-- Intentionally NOT a partial index (no WHERE clause): Supabase JS's
-- upsert({ onConflict }) can only target a plain unique index/constraint, not
-- a partial one. A standard unique index still allows multiple NULL
-- source_record_id rows (manual/quick-capture docs), since NULL <> NULL for
-- uniqueness purposes — so this behaves the same as a partial index would.
CREATE UNIQUE INDEX IF NOT EXISTS brain_documents_source_unique
  ON public.brain_documents (source_system, source_record_id);

-- Same idempotent-upsert idea, but keyed on external_id (e.g. a Google Drive
-- file id) for sources that don't have a UUID primary key of their own —
-- vault_files identifies rows by drive_id (a Drive-assigned string), not a UUID.
CREATE UNIQUE INDEX IF NOT EXISTS brain_documents_external_unique
  ON public.brain_documents (source_system, external_id);

CREATE INDEX IF NOT EXISTS brain_documents_pending_idx
  ON public.brain_documents (index_status)
  WHERE index_status IN ('pending', 'error');

CREATE INDEX IF NOT EXISTS brain_documents_doc_type_idx
  ON public.brain_documents (doc_type);

CREATE INDEX IF NOT EXISTS brain_documents_occurred_at_idx
  ON public.brain_documents (occurred_at DESC);

ALTER TABLE public.brain_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ProsperWise staff can view brain documents"
ON public.brain_documents
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

CREATE POLICY "ProsperWise staff can create brain documents"
ON public.brain_documents
FOR INSERT
TO authenticated
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

CREATE POLICY "ProsperWise staff can edit brain documents"
ON public.brain_documents
FOR UPDATE
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

CREATE POLICY "ProsperWise staff can remove brain documents"
ON public.brain_documents
FOR DELETE
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

CREATE TRIGGER update_brain_documents_updated_at
BEFORE UPDATE ON public.brain_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- brain_chunks: the retrieval unit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brain_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.brain_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  heading TEXT,
  token_estimate INTEGER,
  embedding extensions.vector(768),
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-005',
  content_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(heading, '') || ' ' || content)
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT brain_chunks_document_chunk_unique UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS brain_chunks_document_id_idx
  ON public.brain_chunks (document_id);

CREATE INDEX IF NOT EXISTS brain_chunks_embedding_idx
  ON public.brain_chunks USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX IF NOT EXISTS brain_chunks_content_tsv_idx
  ON public.brain_chunks USING gin (content_tsv);

ALTER TABLE public.brain_chunks ENABLE ROW LEVEL SECURITY;

-- Staff can read chunks (needed for the document-detail chunk inspector).
-- No INSERT/UPDATE/DELETE policies: only the service-role indexer writes,
-- and service role bypasses RLS entirely.
CREATE POLICY "ProsperWise staff can view brain chunks"
ON public.brain_chunks
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

-- ============================================================
-- brain_entity_links: polymorphic join to CRM entities
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brain_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.brain_documents(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  link_source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT brain_entity_links_entity_type_check CHECK (
    entity_type IN ('contact', 'family', 'household', 'corporation', 'professional', 'lead')
  ),
  CONSTRAINT brain_entity_links_link_source_check CHECK (
    link_source IN ('manual', 'inherited', 'ai')
  ),
  CONSTRAINT brain_entity_links_unique UNIQUE (document_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS brain_entity_links_entity_idx
  ON public.brain_entity_links (entity_type, entity_id);

ALTER TABLE public.brain_entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ProsperWise staff can view brain entity links"
ON public.brain_entity_links
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

CREATE POLICY "ProsperWise staff can create brain entity links"
ON public.brain_entity_links
FOR INSERT
TO authenticated
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

CREATE POLICY "ProsperWise staff can remove brain entity links"
ON public.brain_entity_links
FOR DELETE
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

-- ============================================================
-- brain_queries: log of "ask the brain" interactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brain_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  question TEXT NOT NULL,
  answer TEXT,
  citations JSONB NOT NULL DEFAULT '[]',
  chunk_ids UUID[] NOT NULL DEFAULT '{}',
  latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_queries_created_at_idx
  ON public.brain_queries (created_at DESC);

ALTER TABLE public.brain_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ProsperWise staff can view brain queries"
ON public.brain_queries
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

-- Inserts happen only via the service-role client from brain-search;
-- no INSERT policy needed for `authenticated`.

-- ============================================================
-- Storage: brain-uploads bucket (staff-only, mirrors charter-source-uploads)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('brain-uploads', 'brain-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ProsperWise staff can view brain upload files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'brain-uploads'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca'
);

CREATE POLICY "ProsperWise staff can upload brain files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'brain-uploads'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca'
);

CREATE POLICY "ProsperWise staff can update brain upload files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'brain-uploads'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca'
)
WITH CHECK (
  bucket_id = 'brain-uploads'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca'
);

CREATE POLICY "ProsperWise staff can delete brain upload files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'brain-uploads'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca'
);

-- ============================================================
-- match_brain_chunks: semantic (+ optional filtered) similarity search.
-- SECURITY DEFINER so it can be called from an edge function with the
-- service-role client; execution is then locked down to service_role
-- only below. This is the entire security boundary for retrieval, so
-- the REVOKE step must never be dropped in a future migration.
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_brain_chunks(
  query_embedding extensions.vector(768),
  match_count INTEGER DEFAULT 12,
  similarity_threshold DOUBLE PRECISION DEFAULT 0.35,
  filter_doc_types TEXT[] DEFAULT NULL,
  filter_entity_type TEXT DEFAULT NULL,
  filter_entity_id UUID DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  chunk_index INTEGER,
  content TEXT,
  heading TEXT,
  similarity DOUBLE PRECISION,
  title TEXT,
  doc_type TEXT,
  source_system TEXT,
  source_url TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.chunk_index,
    c.content,
    c.heading,
    1 - (c.embedding <=> query_embedding) AS similarity,
    d.title,
    d.doc_type,
    d.source_system,
    d.source_url,
    d.occurred_at
  FROM public.brain_chunks c
  JOIN public.brain_documents d ON d.id = c.document_id
  WHERE
    c.embedding IS NOT NULL
    AND d.is_active = true
    AND (1 - (c.embedding <=> query_embedding)) >= similarity_threshold
    AND (filter_doc_types IS NULL OR d.doc_type = ANY (filter_doc_types))
    AND (
      filter_entity_type IS NULL
      OR EXISTS (
        SELECT 1 FROM public.brain_entity_links l
        WHERE l.document_id = d.id
          AND l.entity_type = filter_entity_type
          AND (filter_entity_id IS NULL OR l.entity_id = filter_entity_id)
      )
    )
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_brain_chunks(
  extensions.vector, INTEGER, DOUBLE PRECISION, TEXT[], TEXT, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.match_brain_chunks(
  extensions.vector, INTEGER, DOUBLE PRECISION, TEXT[], TEXT, UUID
) TO service_role;
