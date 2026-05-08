## Goal

Keep household-scoped vault structure as-is. Add two capabilities:

1. **Granular client write permissions** (per-contact baseline role + per-folder overrides; capped at upload + rename + delete-own).
2. **Vault-only sharing links** for files and folders — never expose Drive URLs. Two link types: portal deep-links (logged-in clients/staff) and tokenized guest links (outside parties). All three permission levels supported per link: view, view+upload, view+upload+download.

---

## Database (one migration)

### New table: `vault_contact_roles`
Per-contact baseline role inside their household vault.
- `contact_id` (unique, FK contacts)
- `household_id`
- `role` enum `vault_contact_role`: `viewer` (default) | `contributor` | `manager`
  - viewer: read-only
  - contributor: upload anywhere they can view + rename/delete files they uploaded
  - manager: contributor + can create folders + manage other portal members' permissions for this household
- `granted_by`, timestamps

### New table: `vault_contact_grants`
Per-folder overrides on top of the contact role (mirrors `vault_collaborator_grants` but for portal contacts).
- `contact_id`, `household_id`
- `scope_type` `'folder' | 'file'`, `drive_id`
- `permission` `'view' | 'upload' | 'manage'` (manage = upload + rename/delete-own + create subfolders)
- `expires_at` (nullable — typically permanent for own household)
- `granted_by`, `granted_at`, `revoked_at`

### Extend `vault_files`
- `uploaded_by_contact_id uuid` — needed to enforce "delete own" rule.

### New table: `vault_share_links`
Single table for both link types.
- `id`, `token` (random 32 bytes hex, unique)
- `link_type` `'portal' | 'guest'`
- `household_id`, `scope_type` `'folder' | 'file'`, `drive_id`
- `permission` `'view' | 'view_upload' | 'view_upload_download'`
- `unlock_code text` (nullable; only for guest)
- `expires_at` (nullable)
- `max_uses int` (nullable), `use_count int` default 0
- `created_by uuid`, `created_at`, `revoked_at`
- `last_accessed_at`, `bound_user_agent` (set on first guest unlock)

RLS: staff manage all rows; service role read for the edge function. No public read.

---

## Edge function changes (`vault-service`)

### Actor resolution
Add a fourth actor: `share_link` (resolved from `x-vault-share-token` + optional `x-vault-unlock-code`). Carries `{ scope_drive_id, permission, household_id }`.

### Permission engine (replace `ensureAccess` body)
For each actor:
- `staff` — allow.
- `client` — walk ancestors. Must hit household root. Then compute effective permission:
  1. Start with baseline from `vault_contact_roles.role` (default `viewer`).
  2. Apply most-specific matching `vault_contact_grants` row (file beats folder beats household-root).
  3. For files: still honor `client_visible=false` (hidden from non-staff unless explicit grant).
  - `needWrite='upload'` → allow if effective ≥ contributor / `upload`.
  - `needWrite='rename'` or `'delete'` → allow only if `vault_files.uploaded_by_contact_id = actor.contactId` AND effective ≥ contributor; OR effective = `manager`.
  - `needWrite='create_folder'` → manager only.
- `collaborator` — unchanged.
- `share_link` — chain must contain `scope_drive_id`. Map permission → upload/download flags. Guest unlock + UA binding identical to existing guest token.

### New / changed actions
- `setContactRole` (staff) — upsert `vault_contact_roles`.
- `setContactGrant` (staff) — insert/update `vault_contact_grants`.
- `listContactPermissions` (staff) — for the household-permissions UI.
- `renameItem` (any actor with rename right) — Drive `files.update` + update `vault_files.name`.
- `deleteItem` (any actor with delete right) — Drive `files.update {trashed:true}` + soft-mark in `vault_files`.
- `createFolder` (staff or manager-client) — Drive create + `vault_files` row.
- `createShareLink` (staff) — body: `{ scope_type, drive_id, permission, link_type, expires_at?, max_uses?, generate_unlock_code? }` → returns `{ token, unlockCode?, url }`. URL is `app.prosperwise.ca/portal/vault?share=<token>` for portal links and `app.prosperwise.ca/vault/share/<token>` for guest links.
- `listShareLinks` (staff, scoped to household) — for revoke UI.
- `revokeShareLink` (staff).
- `redeemShareLink` (anonymous → returns scope info after unlock-code check; binds UA).
- Existing `uploadFile` — drop the "shoebox-only" restriction for clients; replace with the new permission engine. Always set `uploaded_by_contact_id` on the row.

Audit every new action.

---

## Frontend

### Staff (`src/pages/Vault.tsx`)
- New right-rail "Permissions" tab on a selected file/folder:
  - Section A — **Household members** table: each portal contact in this household, role dropdown (viewer/contributor/manager), per-folder grant chips. "Add grant" picks a folder.
  - Section B — **Share links** list for the selected item: token (masked), permission, expiry, uses, copy URL, revoke. "Create share link" button opens dialog (link type, permission, expiry, generate unlock code toggle).
- Item context menu adds **Rename**, **Delete**, **Copy Vault link** (defaults to portal link if any portal users exist for the household, otherwise guest link). All staff actions go through `vault-service`, never Drive.

### Portal (`src/components/portal/PortalVault.tsx`)
- Resolve effective permission per-folder from server (`getEffectivePermission` action) so UI hides/shows actions correctly.
- Add controls when permitted:
  - Upload button on any folder where effective ≥ upload.
  - Inline rename (pencil) and delete (trash) on rows where `uploaded_by_contact_id === me` (or manager).
  - "New folder" button when manager.
  - "Copy link" on any item — opens a small dialog that calls `createShareLink` with portal link type by default. Pasted link is always a Vault URL (`/portal/vault?share=...`).

### Guest (`src/pages/VaultGuest.tsx`)
- Already handles unlock code. Extend to handle share-link tokens (`/vault/share/:token`) — same screen, but the token resolves to a single file or folder rather than collaborator grants.
- If permission allows upload, render an upload zone. If permission allows download, render download buttons. View-only stays as preview only.

### Portal share-redeem route
- New route `/portal/vault?share=<token>` inside Portal.tsx — auto-navigates the Vault tab to the shared scope after resolving the link server-side, applying the link's permission as a UI cap (cannot exceed personal effective permission for this user — most-restrictive wins for portal links to enforce "still inside firewall").

---

## Security recap

- Drive IDs and Drive URLs never leave the edge function.
- Share-link redeem requires unlock code (guest) or active portal session (portal).
- `redeemShareLink` runs the same ancestor walk to confirm the scope is inside the household root recorded on the link — protects against tampered links targeting unrelated Drive IDs.
- Per-link `max_uses`, `expires_at`, and instant `revoked_at` give staff full kill switch.
- All bytes still streamed through Montreal edge function (PIPEDA).
- Audit log entries: `share_link_created`, `share_link_redeemed`, `share_link_revoked`, `rename`, `delete`, `create_folder`, `set_role`, `set_grant`.

---

## Files touched

- New migration (tables + enum + columns + RLS).
- Edit `supabase/functions/vault-service/index.ts` (actor, permission engine, new actions).
- Edit `src/pages/Vault.tsx` (Permissions tab, rename/delete/copy-link, share-link manager).
- Edit `src/components/portal/PortalVault.tsx` (upload/rename/delete/new-folder/copy-link).
- Edit `src/pages/VaultGuest.tsx` (share-token mode + upload/download controls).
- Edit `src/pages/Portal.tsx` (handle `?share=` query param on Vault tab).
- Update `mem://features/vault-privacy-firewall.md` (record new permission model + share links).
