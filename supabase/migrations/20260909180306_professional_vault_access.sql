-- Link professionals directly into the existing Vault collaborator/grant
-- model, so staff can grant a linked professional folder/file access
-- without a separate magic-link invite step. professional_contact_id is
-- confirmed dead (never read or written anywhere in this codebase) --
-- repurposed here rather than adding a parallel structure.

ALTER TABLE public.vault_collaborators
  RENAME COLUMN professional_contact_id TO professional_id;

ALTER TABLE public.vault_collaborators
  ADD CONSTRAINT vault_collaborators_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;

-- A professional gets at most one vault_collaborators row per household --
-- parallel to, but independent of, the household_id+email uniqueness
-- guest-invited (magic-link) rows use.
CREATE UNIQUE INDEX vault_collaborators_household_professional_key
  ON public.vault_collaborators(household_id, professional_id)
  WHERE professional_id IS NOT NULL;

CREATE INDEX idx_vault_collaborators_professional
  ON public.vault_collaborators(professional_id);

COMMENT ON COLUMN public.professional_engagements.vault_share_link_id IS
  'Deprecated -- superseded by household-scoped vault_collaborators/vault_collaborator_grants (see professional_id on vault_collaborators). Do not read/write in new code; drop in a follow-up once pro-portal-engagements.ts and ShareVaultFilesControl.tsx no longer reference it.';
