CREATE TABLE public.intake_classifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  drive_file_id TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  predicted_category TEXT,
  confidence NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  review_required BOOLEAN NOT NULL DEFAULT false,
  matched_checklist_template_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_classifications_household ON public.intake_classifications(household_id, created_at DESC);
CREATE INDEX idx_intake_classifications_status ON public.intake_classifications(household_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_classifications TO authenticated;
GRANT ALL ON public.intake_classifications TO service_role;

ALTER TABLE public.intake_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can manage intake classifications"
ON public.intake_classifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_intake_classifications_updated_at
BEFORE UPDATE ON public.intake_classifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.intake_checklist_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  requirement TEXT NOT NULL DEFAULT 'optional',
  household_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_checklist_templates_active ON public.intake_checklist_templates(is_active, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_checklist_templates TO authenticated;
GRANT ALL ON public.intake_checklist_templates TO service_role;

ALTER TABLE public.intake_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can manage intake checklist templates"
ON public.intake_checklist_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_intake_checklist_templates_updated_at
BEFORE UPDATE ON public.intake_checklist_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.intake_classifications
ADD CONSTRAINT fk_intake_classifications_template
FOREIGN KEY (matched_checklist_template_id) REFERENCES public.intake_checklist_templates(id) ON DELETE SET NULL;