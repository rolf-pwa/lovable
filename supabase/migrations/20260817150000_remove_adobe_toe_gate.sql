-- The Terms of Engagement is no longer tied to the Web Forms registry at
-- all — it's a name/email/agree clickwrap linking to a document hosted on
-- our own domain, not an Adobe-signed form. Having both an Adobe signature
-- and a checkbox was redundant; the checkbox is the sole acceptance
-- mechanism now. Removes the now-meaningless is_toe_gate concept from
-- adobe_webforms and the vestigial FK on toe_acceptances (2 existing rows
-- keep their name/email/slug/timestamp — only the link to a specific
-- Adobe form is dropped, since that concept no longer exists).
DROP POLICY IF EXISTS "Public can read the active ToE gate form" ON public.adobe_webforms;
DROP INDEX IF EXISTS idx_adobe_webforms_single_toe_gate;
ALTER TABLE public.adobe_webforms DROP COLUMN IF EXISTS is_toe_gate;

ALTER TABLE public.toe_acceptances DROP COLUMN IF EXISTS webform_id;
