-- Schedules the daily-briefing-generate job to run every morning, ahead of
-- the Kelowna, BC (Pacific Time) work day, generating each staff member's
-- Daily Briefing. pg_cron + pg_net already enabled (20260331021858_...sql).
-- Modeled on retention-review's pattern (20260810122000_...sql).
--
-- Timing: 13:00 UTC = 5:00am PST / 6:00am PDT. pg_cron runs in UTC while
-- Kelowna observes Pacific Time, so this fixed UTC time will drift by an
-- hour across the two DST transitions each year -- accepted, same tradeoff
-- already made for other cron jobs in this codebase. 13:00 UTC is chosen so
-- the briefing is ready well before any staff member's start of day in
-- either PST or PDT.
--
-- MANUAL STEP REQUIRED before this schedule will actually work
-- (deliberately NOT done here, so no secret value ever enters a migration
-- file / git history):
--   1. Generate a random secret, e.g. `openssl rand -hex 32`.
--   2. Set it as an edge function secret:
--        supabase secrets set DAILY_BRIEFING_CRON_SECRET=<the-random-value>
--   3. Store the SAME value in Supabase Vault, run once by hand in the SQL
--      editor (not as a migration, for the same never-in-git reason):
--        select vault.create_secret('<the-random-value>', 'daily_briefing_cron_secret');
-- Until step 3 is done, this cron job will call daily-briefing-generate with
-- a blank secret header, the function will reject it (401), and briefings
-- simply won't generate until it's configured.

select cron.schedule(
  'daily-briefing-generate',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://rpxevcovasrgmrzkpknu.supabase.co/functions/v1/daily-briefing-generate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-daily-briefing-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'daily_briefing_cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
