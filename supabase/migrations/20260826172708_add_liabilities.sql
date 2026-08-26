-- Liabilities: generic enough to cover personal debts, corporate debts, and
-- intercompany/shareholder loans in one schema, so the Quarterly VFO Audit's
-- CRA s.15(2) check and the VFO Portal's intercompany-loan tracker can reuse
-- this table later instead of a second one being invented. Mirrors the
-- corporations/shareholders migration's conventions (20260227013840_...sql):
-- gen_random_uuid() PK, blanket USING (true) RLS matching the documented
-- flat-staff-access design, update_updated_at_column() trigger.

CREATE TYPE public.liability_holder_type AS ENUM ('contact', 'corporation');

CREATE TYPE public.liability_type AS ENUM (
  'mortgage',
  'personal_loan',
  'line_of_credit',
  'credit_card',
  'intercompany_loan',
  'shareholder_loan',
  'other_debt'
);

CREATE TYPE public.liability_counterparty_type AS ENUM ('external', 'corporation', 'contact');

CREATE TABLE public.liabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  holder_type public.liability_holder_type NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  corporation_id UUID REFERENCES public.corporations(id) ON DELETE CASCADE,
  CONSTRAINT liabilities_holder_matches_type CHECK (
    (holder_type = 'contact' AND contact_id IS NOT NULL AND corporation_id IS NULL) OR
    (holder_type = 'corporation' AND corporation_id IS NOT NULL AND contact_id IS NULL)
  ),

  liability_type public.liability_type NOT NULL DEFAULT 'other_debt',
  description TEXT NOT NULL,

  -- Only meaningful for intercompany_loan / shareholder_loan rows — who's owed
  -- the money. 'external' (e.g. a bank) needs no counterparty reference.
  counterparty_type public.liability_counterparty_type,
  counterparty_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  counterparty_corporation_id UUID REFERENCES public.corporations(id) ON DELETE SET NULL,
  CONSTRAINT liabilities_counterparty_matches_type CHECK (
    counterparty_type IS NULL OR
    (counterparty_type = 'external' AND counterparty_contact_id IS NULL AND counterparty_corporation_id IS NULL) OR
    (counterparty_type = 'contact' AND counterparty_contact_id IS NOT NULL AND counterparty_corporation_id IS NULL) OR
    (counterparty_type = 'corporation' AND counterparty_corporation_id IS NOT NULL AND counterparty_contact_id IS NULL)
  ),

  original_amount NUMERIC,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  interest_rate_pct NUMERIC,
  origination_date DATE,
  due_date DATE,
  notes TEXT,

  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_liabilities_contact ON public.liabilities(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_liabilities_corporation ON public.liabilities(corporation_id) WHERE corporation_id IS NOT NULL;
CREATE INDEX idx_liabilities_due_date ON public.liabilities(due_date) WHERE due_date IS NOT NULL;

ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view liabilities" ON public.liabilities FOR SELECT USING (true);
CREATE POLICY "Advisors can insert liabilities" ON public.liabilities FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Advisors can update liabilities" ON public.liabilities FOR UPDATE USING (true);
CREATE POLICY "Advisors can delete liabilities" ON public.liabilities FOR DELETE USING (true);

CREATE TRIGGER update_liabilities_updated_at BEFORE UPDATE ON public.liabilities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
