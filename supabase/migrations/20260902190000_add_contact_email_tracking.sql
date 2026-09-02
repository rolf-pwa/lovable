-- Per-staff tracked email send from a contact's Communications tab.
-- Metadata-only: the composed body itself is NOT stored -- the email is
-- sent through the staff member's own connected Gmail account, so it lands
-- in their own Sent folder and is already findable by the existing
-- live-search ContactEmails history panel. A second copy of client
-- correspondence in Postgres would be pure duplication with no benefit.

CREATE TABLE public.contact_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  tracking_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  opened_at TIMESTAMP WITH TIME ZONE,
  last_opened_at TIMESTAMP WITH TIME ZONE,
  open_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_emails TO authenticated;
GRANT ALL ON public.contact_emails TO service_role;
ALTER TABLE public.contact_emails ENABLE ROW LEVEL SECURITY;

-- Blanket staff policy, matching pm_tasks' own convention. No anon policy --
-- the public tracking endpoint (email-track) uses the service-role client
-- internally, never relying on anon-role RLS for the pixel/click writes.
CREATE POLICY "Staff can manage contact_emails"
  ON public.contact_emails FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_contact_emails_contact ON public.contact_emails (contact_id);
CREATE INDEX idx_contact_emails_gmail_message_id ON public.contact_emails (gmail_message_id);

-- ---------------------------------------------------------------------------

-- Per-link click tracking. target_url is only ever resolved server-side by
-- this row's own id (?l=<id>) -- never accepted as a query-string value --
-- to avoid an open-redirect vector on the public click endpoint.
CREATE TABLE public.contact_email_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID NOT NULL REFERENCES public.contact_emails(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  clicked_at TIMESTAMP WITH TIME ZONE,
  last_clicked_at TIMESTAMP WITH TIME ZONE,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_email_links TO authenticated;
GRANT ALL ON public.contact_email_links TO service_role;
ALTER TABLE public.contact_email_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage contact_email_links"
  ON public.contact_email_links FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_contact_email_links_email ON public.contact_email_links (email_id);
