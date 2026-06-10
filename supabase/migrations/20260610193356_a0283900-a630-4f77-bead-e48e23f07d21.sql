ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS vault_shoebox_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS vault_shoebox_folder_id text;
COMMENT ON COLUMN public.contacts.vault_shoebox_only IS 'When true, this client only sees the Shoebox folder in the portal vault; all other vault folders are hidden and inaccessible.';
COMMENT ON COLUMN public.households.vault_shoebox_folder_id IS 'Drive ID of the Shoebox child folder under this household vault root. Cached lazily by vault-service.';