-- Client Portal task view migration, Phase 2: adds what pm_tasks/pm_task_comments
-- need to support a client-facing (token-authenticated, not auth.users) consumer.

-- Client visibility. Defaults true to match today's Asana-backed behavior (the
-- client currently sees every task in their linked Asana project, unfiltered) --
-- staff can mark specific tasks staff-only over time rather than needing to
-- pre-tag everything before the client Portal task view can cut over.
ALTER TABLE public.pm_tasks
  ADD COLUMN client_visible BOOLEAN NOT NULL DEFAULT true;

-- A comment's author is either a staff member (author_id -> auth.users, as today)
-- or a client (author_contact_id -> contacts) -- clients authenticate via a
-- portal_token, not a real Supabase Auth session, so they have no auth.users row.
-- Exactly one of the two is set per row; enforced in code, matching this schema's
-- existing convention for single-owner FK columns (e.g. pm_projects' own links).
ALTER TABLE public.pm_task_comments
  ALTER COLUMN author_id DROP NOT NULL,
  ADD COLUMN author_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
