-- Pro Portal migration off Asana, step 1: professional tagging on pm_tasks
-- (the sole read/write authorization gate for a professional in the new
-- pm-pro-tasks edge function), a matching comment-author column, and a
-- family_id column so family-level Pro Portal tasks have a real target
-- instead of an arbitrary "first household" fallback.

CREATE TABLE public.pm_task_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  -- NULL for a self-tag (pro created the task via the Pro Portal, no
  -- auth.users row to attribute); set to the staff user's id when tagged
  -- from TaskDetailPanel's "Tagged Professionals" picker.
  tagged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (task_id, professional_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_task_collaborators TO authenticated;
GRANT ALL ON public.pm_task_collaborators TO service_role;
ALTER TABLE public.pm_task_collaborators ENABLE ROW LEVEL SECURITY;

-- Blanket staff policy, matching pm_tasks' own convention. No client/pro RLS
-- policy: all pro-facing access to this table goes through pm-pro-tasks,
-- which uses the service-role key end-to-end, same as portal-pm-tasks.
CREATE POLICY "Staff can manage pm_task_collaborators"
  ON public.pm_task_collaborators FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_pm_task_collaborators_task ON public.pm_task_collaborators (task_id);
CREATE INDEX idx_pm_task_collaborators_professional ON public.pm_task_collaborators (professional_id);

-- ---------------------------------------------------------------------------

-- Third mutually-exclusive-in-code comment author, alongside author_id
-- (staff) and author_contact_id (client). A professional authenticates via
-- pro_portal_tokens, not a real Supabase Auth session, so — like a client —
-- they have no auth.users row.
ALTER TABLE public.pm_task_comments
  ADD COLUMN author_professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------

ALTER TABLE public.pm_tasks
  ADD COLUMN family_id UUID REFERENCES public.families(id) ON DELETE SET NULL;

CREATE INDEX idx_pm_tasks_family ON public.pm_tasks (family_id);
