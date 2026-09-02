-- The /pay/:slug Terms of Engagement clickwrap is a public page, but its
-- INSERT policy only ever covered the anon role. Anyone landing on the page
-- with an active Supabase session (most commonly a staff member testing
-- their own payment link while logged into the CRM in the same browser)
-- resolves to the authenticated role instead, which had no INSERT policy at
-- all -- producing a raw "row-level security policy" error instead of
-- recording the acceptance. Extend the existing policy to cover both roles;
-- the WITH CHECK stays unconditional (true), matching the original design
-- (a name/email/checkbox clickwrap, not something that needs per-row
-- authorization logic).

DROP POLICY "Public can record a ToE acceptance" ON public.toe_acceptances;

CREATE POLICY "Public can record a ToE acceptance"
ON public.toe_acceptances FOR INSERT TO anon, authenticated
WITH CHECK (true);

GRANT INSERT ON public.toe_acceptances TO authenticated;
