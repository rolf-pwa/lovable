-- Marks a single registered Web Form as "the" Terms of Engagement gate shown
-- on the public /toe/:slug page before a prospect reaches payment. One
-- generic ToE covers every service, so at most one row may be flagged —
-- enforced with a partial unique index rather than application logic alone.
ALTER TABLE public.adobe_webforms
  ADD COLUMN IF NOT EXISTS is_toe_gate BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_adobe_webforms_single_toe_gate
  ON public.adobe_webforms ((is_toe_gate))
  WHERE is_toe_gate = true;

-- The /toe/:slug page is public (unauthenticated prospects, pre-payment) and
-- needs to read just the flagged gate form's widget_url/fields — nothing
-- else in this table should be anon-readable.
CREATE POLICY "Public can read the active ToE gate form"
ON public.adobe_webforms FOR SELECT TO anon
USING (is_toe_gate = true AND is_active = true);
