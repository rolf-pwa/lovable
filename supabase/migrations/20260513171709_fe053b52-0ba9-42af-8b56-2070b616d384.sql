CREATE TYPE public.manual_activity_kind AS ENUM ('call', 'sms');
CREATE TYPE public.manual_activity_direction AS ENUM ('inbound', 'outbound');

CREATE TABLE public.manual_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL,
  kind public.manual_activity_kind NOT NULL,
  direction public.manual_activity_direction NOT NULL DEFAULT 'outbound',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER,
  subject TEXT,
  body TEXT NOT NULL DEFAULT '',
  logged_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_activity_contact ON public.manual_activity_log (contact_id, occurred_at DESC);

ALTER TABLE public.manual_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view activity log"
  ON public.manual_activity_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Staff can insert activity log"
  ON public.manual_activity_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = logged_by);

CREATE POLICY "Staff can update activity log"
  ON public.manual_activity_log FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Staff can delete activity log"
  ON public.manual_activity_log FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER set_manual_activity_log_updated_at
  BEFORE UPDATE ON public.manual_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();