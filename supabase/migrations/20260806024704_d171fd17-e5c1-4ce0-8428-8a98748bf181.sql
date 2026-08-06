ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference text;