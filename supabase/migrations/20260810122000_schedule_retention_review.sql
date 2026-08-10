-- Schedules the retention-review job (retention-review?...) to run daily,
-- flagging households whose relationship ended 7+ years ago for staff
-- review. pg_cron + pg_net already enabled (see
-- 20260331021858_...sql). Modeled on brain-index-drain's pattern
-- (20260809180500_...sql / 20260810120000_...sql), but daily rather than
-- every 5 minutes — a 7-year threshold doesn't need minute-level
-- responsiveness.
--
-- MANUAL STEP REQUIRED before this schedule will actually work
-- (deliberately NOT done here, so no secret value ever enters a
-- migration file / git history):
--   1. Generate a random secret, e.g. `openssl rand -hex 32`.
--   2. Set it as an edge function secret:
--        supabase secrets set RETENTION_CRON_SECRET=<the-random-value>
--   3. Store the SAME value in Supabase Vault, run once by hand in the SQL
--      editor (not as a migration, for the same never-in-git reason):
--        select vault.create_secret('<the-random-value>', 'retention_cron_secret');
-- Until step 3 is done, this cron job will call retention-review with a
-- blank secret header, retention-review will reject it (401), and the
-- scan simply won't run until it's configured.

select cron.schedule(
  'retention-review',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://rpxevcovasrgmrzkpknu.supabase.co/functions/v1/retention-review',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-retention-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'retention_cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
