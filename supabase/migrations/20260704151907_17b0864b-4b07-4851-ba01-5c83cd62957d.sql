
CREATE TABLE public.insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  corporation_id UUID REFERENCES public.corporations(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  policy_number TEXT,
  policy_type TEXT NOT NULL DEFAULT 'other',
  insured_name TEXT,
  coverage_amount NUMERIC(18,2) DEFAULT 0,
  cash_value NUMERIC(18,2) DEFAULT 0,
  premium_amount NUMERIC(18,2),
  premium_frequency TEXT,
  issue_date DATE,
  renewal_date DATE,
  paid_up_date DATE,
  primary_beneficiary TEXT,
  contingent_beneficiary TEXT,
  coverage_storehouse_id UUID REFERENCES public.storehouses(id) ON DELETE SET NULL,
  cash_value_storehouse_id UUID REFERENCES public.storehouses(id) ON DELETE SET NULL,
  vault_folder_id TEXT,
  notes TEXT,
  visibility_scope TEXT DEFAULT 'household',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT insurance_owner_one CHECK (
    (contact_id IS NOT NULL)::INT + (corporation_id IS NOT NULL)::INT = 1
  ),
  CONSTRAINT insurance_policy_type_check CHECK (
    policy_type IN ('term','whole_life','universal_life','critical_illness','disability','long_term_care','other')
  ),
  CONSTRAINT insurance_frequency_check CHECK (
    premium_frequency IS NULL OR premium_frequency IN ('monthly','quarterly','semi_annual','annual','single')
  )
);

CREATE INDEX idx_insurance_contact ON public.insurance_policies(contact_id);
CREATE INDEX idx_insurance_corp ON public.insurance_policies(corporation_id);
CREATE INDEX idx_insurance_coverage_sh ON public.insurance_policies(coverage_storehouse_id);
CREATE INDEX idx_insurance_cashvalue_sh ON public.insurance_policies(cash_value_storehouse_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view all insurance policies"
  ON public.insurance_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Advisors can insert insurance policies"
  ON public.insurance_policies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Advisors can update insurance policies"
  ON public.insurance_policies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Advisors can delete insurance policies"
  ON public.insurance_policies FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_insurance_policies_updated_at
  BEFORE UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
