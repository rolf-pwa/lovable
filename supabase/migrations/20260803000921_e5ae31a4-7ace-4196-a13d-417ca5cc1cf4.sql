-- =====================================================================
-- SERVICES
-- =====================================================================
CREATE TABLE public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CAD',
  duration_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  square_catalog_object_id TEXT,
  square_variation_id TEXT,
  square_sync_status TEXT NOT NULL DEFAULT 'not_synced',
  square_sync_error TEXT,
  square_synced_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage services"
  ON public.services FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_services_active ON public.services (is_active);

-- =====================================================================
-- INVOICES
-- =====================================================================
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CAD',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  notes TEXT,
  square_invoice_id TEXT,
  square_order_id TEXT,
  square_version INTEGER,
  public_payment_url TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  is_ai_draft BOOLEAN NOT NULL DEFAULT false,
  ai_prompt TEXT,
  review_queue_id UUID REFERENCES public.review_queue(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES public.business_pipeline(id) ON DELETE SET NULL,
  last_error TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_invoices_contact ON public.invoices (contact_id);
CREATE INDEX idx_invoices_status ON public.invoices (status);
CREATE UNIQUE INDEX idx_invoices_square_id ON public.invoices (square_invoice_id) WHERE square_invoice_id IS NOT NULL;

-- =====================================================================
-- INVOICE LINE ITEMS
-- =====================================================================
CREATE TABLE public.invoice_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage invoice line items"
  ON public.invoice_line_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_invoice_line_items_updated_at
  BEFORE UPDATE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items (invoice_id);

-- =====================================================================
-- INVOICE PAYMENTS
-- =====================================================================
CREATE TABLE public.invoice_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  square_payment_id TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CAD',
  status TEXT NOT NULL DEFAULT 'completed',
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage invoice payments"
  ON public.invoice_payments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_invoice_payments_updated_at
  BEFORE UPDATE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments (invoice_id);
CREATE UNIQUE INDEX idx_invoice_payments_square_id ON public.invoice_payments (square_payment_id) WHERE square_payment_id IS NOT NULL;

-- =====================================================================
-- SERVICE BOOKINGS
-- =====================================================================
CREATE TABLE public.service_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  requester_name TEXT,
  requester_email TEXT,
  requester_phone TEXT,
  starts_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'requested',
  notes TEXT,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_bookings TO authenticated;
GRANT INSERT ON public.service_bookings TO anon;
GRANT ALL ON public.service_bookings TO service_role;
ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage bookings"
  ON public.service_bookings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Public can submit booking requests"
  ON public.service_bookings FOR INSERT TO anon
  WITH CHECK (true);

CREATE TRIGGER update_service_bookings_updated_at
  BEFORE UPDATE ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_service_bookings_starts_at ON public.service_bookings (starts_at);
CREATE INDEX idx_service_bookings_status ON public.service_bookings (status);