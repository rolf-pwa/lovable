-- Quarterly Governance Audit: Phase 1 data model for the port of the
-- "Review Agent" prototype (a working standalone Python CLI, not part of
-- this repo) into the CRM. Produces one coherent document per household per
-- run -- not a queue of individual findings to approve/reject like
-- review_queue/governance_review_findings -- so this is a single table,
-- modeled on quarterly_system_reviews/monthly_governance_reviews'
-- conventions (gen_random_uuid() PK, generation_status/generation_error,
-- blanket USING (true) staff RLS, update_updated_at_column() trigger).
--
-- No period_end/uniqueness key -- like stabilization_maps and
-- quarterly_system_reviews, a household can be re-audited any time; the
-- most recent row is what the UI shows. `computed` holds the fully
-- assembled figures (drift score, estate liquidity, pillar totals, tax
-- estimates) plus the AI-drafted narrative once generation completes --
-- everything later phases (calc, narrative, staff UI) will read and render.
-- `is_draft` mirrors the prototype's own DRAFT-watermark -> FINAL toggle:
-- flipping it and re-rendering the same page *is* the port's equivalent of
-- the prototype's separate `finalize` CLI step, no server-side PDF
-- regeneration needed (browser print-to-PDF, per the confirmed decision).

CREATE TABLE public.governance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  is_draft boolean NOT NULL DEFAULT true,
  generation_status text NOT NULL DEFAULT 'generating'
    CHECK (generation_status IN ('generating', 'complete', 'error')),
  generation_error text,
  computed jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.governance_audits TO authenticated;
GRANT ALL ON public.governance_audits TO service_role;

ALTER TABLE public.governance_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view governance audits"
  ON public.governance_audits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert governance audits"
  ON public.governance_audits FOR INSERT TO authenticated
  WITH CHECK (created_by IS NULL OR auth.uid() = created_by);
CREATE POLICY "Staff can update governance audits"
  ON public.governance_audits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete governance audits"
  ON public.governance_audits FOR DELETE TO authenticated USING (true);
CREATE POLICY "Service manages governance audits"
  ON public.governance_audits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_governance_audits_household ON public.governance_audits (household_id, created_at DESC);

CREATE TRIGGER update_governance_audits_updated_at
  BEFORE UPDATE ON public.governance_audits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
