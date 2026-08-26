-- portal-uploads' "Staff can ..." policies checked only `TO authenticated`, not an
-- actual staff identity — harmless while only staff held real Supabase Auth sessions,
-- but client Google Sign-In now mints real `authenticated` JWTs too, so any signed-in
-- client could read/delete another household's uploaded files via the Storage REST API.
-- Match the @prosperwise.ca email-domain check already used for cashflow-uploads /
-- statement-uploads (see 20260507131931_...sql).

DROP POLICY IF EXISTS "Staff can view portal uploads" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete portal uploads" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload portal files" ON storage.objects;

CREATE POLICY "Staff can view portal uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'portal-uploads' AND lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

CREATE POLICY "Staff can delete portal uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'portal-uploads' AND lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');

CREATE POLICY "Staff can upload portal files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'portal-uploads' AND lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@prosperwise.ca');
