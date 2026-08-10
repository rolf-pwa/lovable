-- Schedules the Second Brain indexing drain (brain-index?action=drain) to run
-- every 5 minutes via pg_cron + pg_net (both already enabled — see
-- 20260331021858_...sql). This is a safety-net guarantee: quick-capture and
-- sync actions already trigger indexing optimistically on the client, so
-- this just catches anything left `pending`/`error` for more than 30s.
--
-- MANUAL STEP REQUIRED before this schedule will actually work (deliberately
-- NOT done here, so no secret value ever enters a migration file / git history):
--   1. Generate a random secret, e.g. `openssl rand -hex 32`.
--   2. Set it as an edge function secret:
--        supabase secrets set BRAIN_CRON_SECRET=<the-random-value>
--   3. Store the SAME value in Supabase Vault, run once by hand in the SQL editor
--      (not as a migration, for the same never-in-git reason):
--        select vault.create_secret('<the-random-value>', 'brain_cron_secret');
-- Until step 3 is done, this cron job will call brain-index with a blank
-- secret header, brain-index will reject it (401), and drain simply won't run
-- — quick-capture indexing still works fine in the meantime via the
-- optimistic client-side trigger.

select cron.schedule(
  'brain-index-drain',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://skcgdoiestzqxsooaxur.supabase.co/functions/v1/brain-index',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-brain-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'brain_cron_secret'),
        ''
      )
    ),
    body := jsonb_build_object('action', 'drain')
  );
  $$
);
