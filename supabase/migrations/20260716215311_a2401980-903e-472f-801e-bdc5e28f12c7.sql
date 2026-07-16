
CREATE TABLE public.georgia2_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_key TEXT NOT NULL UNIQUE,
  source TEXT,
  domain TEXT,
  catalyst TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  scale NUMERIC,
  chosen_pathway TEXT,
  final_phase TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  reached_lead_capture BOOLEAN NOT NULL DEFAULT false,
  lead_captured BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  referrer TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.georgia2_sessions TO authenticated;
GRANT ALL ON public.georgia2_sessions TO service_role;

ALTER TABLE public.georgia2_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all georgia2 sessions"
  ON public.georgia2_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_georgia2_sessions_updated_at
  BEFORE UPDATE ON public.georgia2_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_georgia2_sessions_created_at ON public.georgia2_sessions(created_at DESC);

CREATE TABLE public.georgia2_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_key TEXT REFERENCES public.georgia2_sessions(session_key) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT,
  domain TEXT NOT NULL,
  catalyst TEXT NOT NULL,
  chosen_pathway TEXT NOT NULL,
  scale NUMERIC NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.georgia2_leads TO authenticated;
GRANT ALL ON public.georgia2_leads TO service_role;

ALTER TABLE public.georgia2_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all georgia2 leads"
  ON public.georgia2_leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can update georgia2 leads"
  ON public.georgia2_leads FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_georgia2_leads_updated_at
  BEFORE UPDATE ON public.georgia2_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_georgia2_leads_submitted_at ON public.georgia2_leads(submitted_at DESC);
CREATE INDEX idx_georgia2_leads_session_key ON public.georgia2_leads(session_key);
