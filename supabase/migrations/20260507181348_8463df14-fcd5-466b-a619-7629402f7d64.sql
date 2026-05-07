
-- 1. Restrict Realtime subscriptions to staff only
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff only realtime access" ON realtime.messages;
CREATE POLICY "Staff only realtime access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'email'), '') LIKE '%@prosperwise.ca'
);

-- 2. Revoke public/authenticated EXECUTE on internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_otps() FROM PUBLIC, anon, authenticated;
