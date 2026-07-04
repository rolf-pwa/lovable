-- C7: Tighten pro_portal_tokens RLS
-- The current SELECT policy `auth.uid() IS NOT NULL` allows any authenticated
-- staff account to read session/OTP credential hashes. This table is only ever
-- read by edge functions using the service role key (see _shared/pro-portal-auth.ts),
-- so we drop the broad policy entirely. Service role bypasses RLS.
DROP POLICY IF EXISTS "Staff can view pro portal tokens" ON public.pro_portal_tokens;

-- Also drop any other broad policies that may have been created historically.
DROP POLICY IF EXISTS "pro_portal_tokens_select_all" ON public.pro_portal_tokens;
DROP POLICY IF EXISTS "Authenticated can view" ON public.pro_portal_tokens;

-- Belt-and-suspenders: RLS is still enabled, and with no permissive policies
-- authenticated users cannot SELECT any rows. Service role still bypasses RLS.
-- Keep table access grant for service_role explicit.
REVOKE ALL ON public.pro_portal_tokens FROM authenticated, anon;
GRANT ALL ON public.pro_portal_tokens TO service_role;