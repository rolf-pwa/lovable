CREATE TABLE public.quo_activity_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL,
  quo_call_id UUID NULL,
  quo_message_id UUID NULL,
  note TEXT NULL,
  linked_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT quo_activity_links_one_target CHECK (
    (quo_call_id IS NOT NULL)::int + (quo_message_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT quo_activity_links_unique_call UNIQUE (contact_id, quo_call_id),
  CONSTRAINT quo_activity_links_unique_msg UNIQUE (contact_id, quo_message_id)
);

CREATE INDEX idx_quo_activity_links_contact ON public.quo_activity_links(contact_id, created_at DESC);
CREATE INDEX idx_quo_activity_links_call ON public.quo_activity_links(quo_call_id);
CREATE INDEX idx_quo_activity_links_msg ON public.quo_activity_links(quo_message_id);

ALTER TABLE public.quo_activity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view quo activity links"
  ON public.quo_activity_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert quo activity links"
  ON public.quo_activity_links FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = linked_by);

CREATE POLICY "Staff can update quo activity links"
  ON public.quo_activity_links FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can delete quo activity links"
  ON public.quo_activity_links FOR DELETE TO authenticated USING (true);