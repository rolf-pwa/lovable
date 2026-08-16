-- Only one Terms of Engagement is needed for every service, and it's no
-- longer matched to a redirect destination (the gate now lives inline on
-- /pay/:slug itself rather than a separate /toe/:slug page, so there's
-- nothing left for a per-slug mapping to do). Reverts toe_gate_slug back
-- to a single global flag.
DROP POLICY IF EXISTS "Public can read a matching active ToE gate form" ON public.adobe_webforms;
DROP INDEX IF EXISTS idx_adobe_webforms_toe_gate_slug;
ALTER TABLE public.adobe_webforms DROP COLUMN IF EXISTS toe_gate_slug;

ALTER TABLE public.adobe_webforms
  ADD COLUMN IF NOT EXISTS is_toe_gate BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_adobe_webforms_single_toe_gate
  ON public.adobe_webforms ((is_toe_gate))
  WHERE is_toe_gate = true;

CREATE POLICY "Public can read the active ToE gate form"
ON public.adobe_webforms FOR SELECT TO anon
USING (is_toe_gate = true AND is_active = true);
