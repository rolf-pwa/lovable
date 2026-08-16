-- Record of each Terms of Engagement acceptance on the public /toe/:slug
-- page — a name/email/checkbox clickwrap, not an Adobe e-signature (Adobe's
-- redirect-after-completion setting is account/group-wide, not per web
-- form, which made gating on an actual completed signature unreliable).
-- Append-only: no update/delete policy for anyone, staff included.
CREATE TABLE public.toe_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_slug TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  webform_id UUID REFERENCES public.adobe_webforms(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_toe_acceptances_pay_slug ON public.toe_acceptances(pay_slug);

ALTER TABLE public.toe_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can record a ToE acceptance"
ON public.toe_acceptances FOR INSERT TO anon
WITH CHECK (true);

CREATE POLICY "Staff can read ToE acceptances"
ON public.toe_acceptances FOR SELECT TO authenticated
USING (true);
