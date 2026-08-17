-- Schedules process-email-digest to run every 10 minutes, matching the
-- cadence it was always built for (see its own header comment) but was
-- never actually wired up to — task-notification emails have been silently
-- queuing into email_digest_queue with nothing ever draining it. Modeled
-- directly on retention-review's pattern
-- (20260810122000_schedule_retention_review.sql).
--
-- MANUAL STEP REQUIRED before this schedule will actually work
-- (deliberately NOT done here, so no secret value ever enters a
-- migration file / git history):
--   1. Generate a random secret, e.g. `openssl rand -hex 32`.
--   2. Set it as an edge function secret:
--        supabase secrets set DIGEST_CRON_SECRET=<the-random-value>
--   3. Store the SAME value in Supabase Vault, run once by hand in the SQL
--      editor (not as a migration, for the same never-in-git reason):
--        select vault.create_secret('<the-random-value>', 'digest_cron_secret');
-- Until step 3 is done, this cron job will call process-email-digest with a
-- blank secret header, process-email-digest will reject it (401), and the
-- digest simply won't run until it's configured.

select cron.schedule(
  'process-email-digest',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://rpxevcovasrgmrzkpknu.supabase.co/functions/v1/process-email-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-digest-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
