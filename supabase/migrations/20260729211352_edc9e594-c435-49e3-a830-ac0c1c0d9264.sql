ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS intake_manifest_url TEXT,
  ADD COLUMN IF NOT EXISTS intake_upload_url TEXT;