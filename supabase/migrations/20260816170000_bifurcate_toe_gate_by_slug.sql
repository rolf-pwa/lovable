-- Supersedes the single global ToE gate (is_toe_gate) from the previous
-- migration: the real requirement is one ToE per /pay slug — e.g. a
-- separate Personal vs Corporate engagement letter — not one document
-- shown before every kind of purchase. No real row had is_toe_gate set
-- yet, so there's nothing to backfill.
DROP POLICY IF EXISTS "Public can read the active ToE gate form" ON public.adobe_webforms;
DROP INDEX IF EXISTS idx_adobe_webforms_single_toe_gate;
ALTER TABLE public.adobe_webforms DROP COLUMN IF EXISTS is_toe_gate;

-- Matches the /pay/:slug (and /toe/:slug) the form gates. Nullable — most
-- registry rows aren't a ToE gate at all.
ALTER TABLE public.adobe_webforms
  ADD COLUMN IF NOT EXISTS toe_gate_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_adobe_webforms_toe_gate_slug
  ON public.adobe_webforms (toe_gate_slug)
  WHERE toe_gate_slug IS NOT NULL;

-- The /toe/:slug page is public and needs to read just the one form
-- matching its slug — the client's own toe_gate_slug=eq.<slug> filter
-- narrows this further; RLS only caps the maximum exposure.
CREATE POLICY "Public can read a matching active ToE gate form"
ON public.adobe_webforms FOR SELECT TO anon
USING (toe_gate_slug IS NOT NULL AND is_active = true);
