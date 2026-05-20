
CREATE TABLE public.email_digest_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID,
  recipient_email TEXT NOT NULL,
  first_name TEXT,
  task_name TEXT NOT NULL,
  task_event TEXT NOT NULL,
  link_tab TEXT NOT NULL DEFAULT 'tasks',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_email_digest_queue_pending
  ON public.email_digest_queue (recipient_email)
  WHERE sent_at IS NULL;

ALTER TABLE public.email_digest_queue ENABLE ROW LEVEL SECURITY;

-- No public policies: only service role accesses this queue.
