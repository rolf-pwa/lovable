-- Enums
CREATE TYPE public.vault_contact_role AS ENUM ('viewer','contributor','manager');
CREATE TYPE public.vault_share_permission AS ENUM ('view','view_upload','view_upload_download');
CREATE TYPE public.vault_share_link_type AS ENUM ('portal','guest');

-- Per-contact baseline role inside their household vault
CREATE TABLE public.vault_contact_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL UNIQUE,
  household_id uuid NOT NULL,
  role public.vault_contact_role NOT NULL DEFAULT 'viewer',
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vault_contact_roles_household ON public.vault_contact_roles(household_id);

ALTER TABLE public.vault_contact_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage contact roles" ON public.vault_contact_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service manage contact roles" ON public.vault_contact_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_vault_contact_roles_updated
  BEFORE UPDATE ON public.vault_contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-folder/file overrides for portal contacts
CREATE TABLE public.vault_contact_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  household_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('folder','file')),
  drive_id text NOT NULL,
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view','upload','manage')),
  expires_at timestamptz,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX idx_vault_contact_grants_contact ON public.vault_contact_grants(contact_id);
CREATE INDEX idx_vault_contact_grants_drive ON public.vault_contact_grants(drive_id);

ALTER TABLE public.vault_contact_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage contact grants" ON public.vault_contact_grants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service manage contact grants" ON public.vault_contact_grants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Track who uploaded each file (for "delete own" enforcement)
ALTER TABLE public.vault_files ADD COLUMN IF NOT EXISTS uploaded_by_contact_id uuid;
CREATE INDEX IF NOT EXISTS idx_vault_files_uploaded_by_contact ON public.vault_files(uploaded_by_contact_id);

-- Vault-only share links (portal deep-links + tokenized guest links)
CREATE TABLE public.vault_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32),'hex'),
  link_type public.vault_share_link_type NOT NULL,
  household_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('folder','file')),
  drive_id text NOT NULL,
  permission public.vault_share_permission NOT NULL DEFAULT 'view',
  unlock_code text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  bound_user_agent text,
  last_accessed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX idx_vault_share_links_household ON public.vault_share_links(household_id);
CREATE INDEX idx_vault_share_links_drive ON public.vault_share_links(drive_id);

ALTER TABLE public.vault_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage share links" ON public.vault_share_links
  FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() = created_by OR auth.uid() IS NOT NULL);
CREATE POLICY "Service manage share links" ON public.vault_share_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);