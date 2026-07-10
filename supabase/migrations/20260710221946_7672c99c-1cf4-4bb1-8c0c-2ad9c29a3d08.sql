ALTER TABLE public.business_pipeline
  ADD COLUMN IF NOT EXISTS aum_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_coverage_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount numeric NOT NULL DEFAULT 0;