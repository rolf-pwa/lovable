-- In-house PM system, Phase 1: projects, tasks, comments.
-- Pure addition — does not touch the existing Asana-backed task_collaborators /
-- portal_task_interactions tables or any Asana integration.

CREATE TABLE public.pm_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | on_hold | archived
  household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  corporation_id UUID REFERENCES public.corporations(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_projects TO authenticated;
GRANT ALL ON public.pm_projects TO service_role;
ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage pm_projects"
  ON public.pm_projects FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_pm_projects_updated_at
  BEFORE UPDATE ON public.pm_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pm_projects_household ON public.pm_projects (household_id);
CREATE INDEX idx_pm_projects_contact ON public.pm_projects (contact_id);
CREATE INDEX idx_pm_projects_corporation ON public.pm_projects (corporation_id);

-- ---------------------------------------------------------------------------

CREATE TABLE public.pm_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | in_progress | done
  due_date DATE,
  assignee_id UUID REFERENCES auth.users(id),
  household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  corporation_id UUID REFERENCES public.corporations(id) ON DELETE SET NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_tasks TO authenticated;
GRANT ALL ON public.pm_tasks TO service_role;
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage pm_tasks"
  ON public.pm_tasks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_pm_tasks_updated_at
  BEFORE UPDATE ON public.pm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pm_tasks_project ON public.pm_tasks (project_id);
CREATE INDEX idx_pm_tasks_parent ON public.pm_tasks (parent_task_id);
CREATE INDEX idx_pm_tasks_assignee ON public.pm_tasks (assignee_id);
CREATE INDEX idx_pm_tasks_status ON public.pm_tasks (status);
CREATE INDEX idx_pm_tasks_household ON public.pm_tasks (household_id);
CREATE INDEX idx_pm_tasks_contact ON public.pm_tasks (contact_id);
CREATE INDEX idx_pm_tasks_corporation ON public.pm_tasks (corporation_id);

-- ---------------------------------------------------------------------------

CREATE TABLE public.pm_task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_task_comments TO authenticated;
GRANT ALL ON public.pm_task_comments TO service_role;
ALTER TABLE public.pm_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage pm_task_comments"
  ON public.pm_task_comments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_pm_task_comments_task ON public.pm_task_comments (task_id);
