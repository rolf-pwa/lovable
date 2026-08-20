-- Extend task_collaborators to also support tagging a professional (not just
-- a household member contact), so staff can select a pro on a task the same
-- way they already select household members — the pro then sees that task
-- surface in Pro Portal without needing to create it themselves.

ALTER TABLE public.task_collaborators
  ALTER COLUMN contact_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS professional_id UUID NULL REFERENCES public.professionals(id) ON DELETE CASCADE;

ALTER TABLE public.task_collaborators
  ADD CONSTRAINT task_collaborators_one_target CHECK (
    (contact_id IS NOT NULL)::INT + (professional_id IS NOT NULL)::INT = 1
  );

ALTER TABLE public.task_collaborators
  ADD CONSTRAINT task_collaborators_pro_unique UNIQUE (task_gid, professional_id);

CREATE INDEX IF NOT EXISTS idx_task_collaborators_professional ON public.task_collaborators(professional_id);
