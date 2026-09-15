-- Schedules quarterly-vfo-audit-generate (the Intercompany/Shareholder Loan
-- Audit, CRA s.15(2)) to run at 13:00 UTC on the first day of each calendar
-- quarter -- Jan/Apr/Jul/Oct 1st, matching daily-briefing-generate's
-- existing UTC-morning convention. pg_cron + pg_net already enabled (see
-- 20260331021858_...sql). Modeled on 20260810122000_schedule_retention_review.sql.
--
-- MANUAL STEP REQUIRED before this schedule will actually work
-- (deliberately NOT done here, so no secret value ever enters a
-- migration file / git history):
--   1. Generate a random secret, e.g. `openssl rand -hex 32`.
--   2. Set it as an edge function secret:
--        supabase secrets set QUARTERLY_VFO_AUDIT_CRON_SECRET=<the-random-value>
--   3. Store the SAME value in Supabase Vault, run once by hand in the SQL
--      editor (not as a migration, for the same never-in-git reason):
--        select vault.create_secret('<the-random-value>', 'quarterly_vfo_audit_cron_secret');
-- Until step 3 is done, this cron job will call quarterly-vfo-audit-generate
-- with a blank secret header, the function will reject it (401), and the
-- scan simply won't run until it's configured. The "Run Audit Now" button
-- in the Workbench works independently of this (staff-JWT path), so the
-- feature is usable immediately even before the cron secret is set up.

select cron.schedule(
  'quarterly-vfo-audit-generate',
  '0 13 1 1,4,7,10 *',
  $$
  select net.http_post(
    url := 'https://rpxevcovasrgmrzkpknu.supabase.co/functions/v1/quarterly-vfo-audit-generate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-quarterly-vfo-audit-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_vfo_audit_cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
