-- Fixes brain-index-drain (see 20260809180500_e2c4a815-...sql), which was
-- scheduled with the old, decommissioned Supabase project's URL
-- (skcgdoiestzqxsooaxur) instead of the current project. Since that
-- migration already ran, the live cron.job row needs to be re-scheduled,
-- not just the source file corrected — cron.schedule() with the same
-- job_name updates the existing job in place rather than creating a
-- duplicate.

select cron.schedule(
  'brain-index-drain',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://rpxevcovasrgmrzkpknu.supabase.co/functions/v1/brain-index',
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
