
ALTER TABLE public.portal_tokens
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'staff_view',
  ADD COLUMN IF NOT EXISTS single_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_used_ip text,
  ADD COLUMN IF NOT EXISTS first_used_user_agent text,
  ADD COLUMN IF NOT EXISTS target_hash text;

CREATE INDEX IF NOT EXISTS idx_portal_tokens_purpose ON public.portal_tokens(purpose);

CREATE TABLE IF NOT EXISTS public.portal_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device_label text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_used_at timestamptz,
  last_used_ip text,
  user_agent text,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_trusted_devices_contact ON public.portal_trusted_devices(contact_id);
CREATE INDEX IF NOT EXISTS idx_portal_trusted_devices_hash ON public.portal_trusted_devices(token_hash);

ALTER TABLE public.portal_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public select on trusted devices"
  ON public.portal_trusted_devices FOR SELECT
  TO anon, authenticated USING (false);

CREATE POLICY "Deny public insert on trusted devices"
  ON public.portal_trusted_devices FOR INSERT
  TO anon, authenticated WITH CHECK (false);

CREATE POLICY "Deny public update on trusted devices"
  ON public.portal_trusted_devices FOR UPDATE
  TO anon, authenticated USING (false);

CREATE POLICY "Deny public delete on trusted devices"
  ON public.portal_trusted_devices FOR DELETE
  TO anon, authenticated USING (false);
