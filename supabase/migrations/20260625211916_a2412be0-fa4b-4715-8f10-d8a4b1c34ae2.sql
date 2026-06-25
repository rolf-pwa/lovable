
-- =========================================================
-- monthly_governance_reviews
-- =========================================================
CREATE TABLE public.monthly_governance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('household','contact','family')),
  scope_id uuid NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'ingested'
    CHECK (status IN ('ingested','committed','verified','charter_checked','approved_for_reporting','failed')),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  charter_checked_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  briefing_markdown text,
  briefing_principal_markdown text,
  generation_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_id, period_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_governance_reviews TO authenticated;
GRANT ALL ON public.monthly_governance_reviews TO service_role;

ALTER TABLE public.monthly_governance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view monthly governance reviews"
  ON public.monthly_governance_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert monthly governance reviews"
  ON public.monthly_governance_reviews FOR INSERT TO authenticated
  WITH CHECK (created_by IS NULL OR auth.uid() = created_by);
CREATE POLICY "Staff can update monthly governance reviews"
  ON public.monthly_governance_reviews FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete monthly governance reviews"
  ON public.monthly_governance_reviews FOR DELETE TO authenticated USING (true);
CREATE POLICY "Service manages monthly governance reviews"
  ON public.monthly_governance_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_mgr_scope_period
  ON public.monthly_governance_reviews (scope_type, scope_id, period_end DESC);

CREATE TRIGGER update_mgr_updated_at
  BEFORE UPDATE ON public.monthly_governance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- governance_review_findings
-- =========================================================
CREATE TABLE public.governance_review_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.monthly_governance_reviews(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  code text NOT NULL,
  message text NOT NULL,
  account_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.governance_review_findings TO authenticated;
GRANT ALL ON public.governance_review_findings TO service_role;

ALTER TABLE public.governance_review_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage governance findings"
  ON public.governance_review_findings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service manage governance findings"
  ON public.governance_review_findings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_grf_review ON public.governance_review_findings (review_id);

CREATE TRIGGER update_grf_updated_at
  BEFORE UPDATE ON public.governance_review_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- governance_alignment_results
-- =========================================================
CREATE TABLE public.governance_alignment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.monthly_governance_reviews(id) ON DELETE CASCADE,
  fact_key text NOT NULL,
  performance_fact jsonb NOT NULL DEFAULT '{}'::jsonb,
  charter_section_key text,
  charter_principle text NOT NULL DEFAULT '',
  alignment_status text NOT NULL DEFAULT 'needs_review'
    CHECK (alignment_status IN ('aligned','exception','needs_review')),
  exception_reason text,
  recommended_action text,
  evidence_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  advisor_override text CHECK (advisor_override IN ('aligned','exception','needs_review')),
  advisor_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.governance_alignment_results TO authenticated;
GRANT ALL ON public.governance_alignment_results TO service_role;

ALTER TABLE public.governance_alignment_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage governance alignment results"
  ON public.governance_alignment_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service manage governance alignment results"
  ON public.governance_alignment_results FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_gar_review ON public.governance_alignment_results (review_id);

CREATE TRIGGER update_gar_updated_at
  BEFORE UPDATE ON public.governance_alignment_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
