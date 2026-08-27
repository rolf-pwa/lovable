ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS triggers_onboarding BOOLEAN NOT NULL DEFAULT false;

UPDATE public.services
  SET triggers_onboarding = true
  WHERE name IN ('Sovereignty Survey - Personal', 'Sovereignty Survey - Corporate');
