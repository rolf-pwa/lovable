ALTER TABLE public.storehouses
  ADD COLUMN IF NOT EXISTS corporation_id UUID REFERENCES public.corporations(id) ON DELETE CASCADE;

ALTER TABLE public.storehouses
  ALTER COLUMN contact_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_storehouses_corporation_id
  ON public.storehouses(corporation_id);

ALTER TABLE public.storehouses
  DROP CONSTRAINT IF EXISTS storehouses_owner_check;

ALTER TABLE public.storehouses
  ADD CONSTRAINT storehouses_owner_check
  CHECK (
    (contact_id IS NOT NULL AND corporation_id IS NULL)
    OR (contact_id IS NULL AND corporation_id IS NOT NULL)
  );
