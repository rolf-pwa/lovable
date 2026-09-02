-- The Asana backfill's dedup key (asana_gid alone) was wrong: several
-- contacts share the exact same Asana project across different households
-- (e.g. Geneva Lively-Lambert and Sage Kirk), so the second contact to be
-- backfilled always got skipped as a false "already imported" -- their
-- historical tasks ended up attributed only to whoever ran first, invisible
-- to the other contact/household entirely.
--
-- Dedup should be per (asana_gid, contact_id): re-running for the same
-- contact still safely no-ops, but two different contacts who happen to
-- share one Asana project each get their own copy of that history.
DROP INDEX IF EXISTS public.idx_pm_tasks_asana_gid;
CREATE UNIQUE INDEX idx_pm_tasks_asana_gid_contact ON public.pm_tasks (asana_gid, contact_id) WHERE asana_gid IS NOT NULL;
