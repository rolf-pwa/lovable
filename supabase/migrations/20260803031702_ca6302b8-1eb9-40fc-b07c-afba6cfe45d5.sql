ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS booking_url TEXT,
  ADD COLUMN IF NOT EXISTS requires_prepayment BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS amount NUMERIC,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS total NUMERIC,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CAD',
  ADD COLUMN IF NOT EXISTS square_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS square_order_id TEXT,
  ADD COLUMN IF NOT EXISTS square_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduling_url TEXT;

CREATE INDEX IF NOT EXISTS service_bookings_square_order_id_idx ON public.service_bookings (square_order_id);