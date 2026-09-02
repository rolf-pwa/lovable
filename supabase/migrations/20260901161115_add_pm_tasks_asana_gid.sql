-- Asana decommission, step 1: provenance/dedup column for the one-time
-- historical backfill (asana-pm-backfill). Lets the backfill script be safely
-- re-run without duplicating rows -- not used by any live UI.
ALTER TABLE public.pm_tasks ADD COLUMN asana_gid TEXT;

CREATE UNIQUE INDEX idx_pm_tasks_asana_gid ON public.pm_tasks (asana_gid) WHERE asana_gid IS NOT NULL;
