CREATE TABLE public.crm_intake_pushes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  request_payload JSONB,
  response_body JSONB,
  callback_payload JSONB,
  family_folder_url TEXT,
  household_folder_url TEXT,
  error TEXT,
  pushed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_intake_pushes_household ON public.crm_intake_pushes(household_id, created_at DESC);

GRANT SELECT ON public.crm_intake_pushes TO authenticated;
GRANT ALL ON public.crm_intake_pushes TO service_role;

ALTER TABLE public.crm_intake_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can view intake pushes"
ON public.crm_intake_pushes FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_crm_intake_pushes_updated_at
BEFORE UPDATE ON public.crm_intake_pushes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();