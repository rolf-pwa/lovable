-- Asana live project importer support:
-- 1. pm_projects needs a family_id target option -- the only one of the four
--    mutually-exclusive scope columns missing today (pm_tasks already has it,
--    added in 20260902140000_add_pm_task_collaborators.sql). Several of the
--    leftover Asana projects being imported are family-level, not
--    household/contact/corporation-level.
ALTER TABLE public.pm_projects
  ADD COLUMN family_id UUID REFERENCES public.families(id) ON DELETE SET NULL;

CREATE INDEX idx_pm_projects_family ON public.pm_projects (family_id);

-- 2. New dedup key for the live importer. The existing
--    idx_pm_tasks_asana_gid_contact (asana_gid, contact_id) -- added in
--    20260901195032_fix_pm_tasks_asana_gid_dedup.sql -- gives zero protection
--    here: every import via this new tool always resolves a concrete
--    project_id, but very often contact_id IS NULL (firm-internal/operational
--    projects), and Postgres treats every NULL as distinct in a unique index,
--    so two re-runs of the same null-contact import would both insert
--    cleanly. Scope dedup to (asana_gid, project_id) instead -- project_id is
--    the one column this tool always resolves before writing a single row.
--    Different column pair, both partial unique indexes -- coexists fine
--    with idx_pm_tasks_asana_gid_contact.
CREATE UNIQUE INDEX idx_pm_tasks_asana_gid_project
  ON public.pm_tasks (asana_gid, project_id)
  WHERE asana_gid IS NOT NULL AND project_id IS NOT NULL;
