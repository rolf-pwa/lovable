ALTER TABLE public.families ADD COLUMN IF NOT EXISTS vfo_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS vfo_enrolled_at timestamptz;