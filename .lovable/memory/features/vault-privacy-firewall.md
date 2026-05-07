---
name: Vault Privacy Firewall
description: Household-scoped vault root + per-file/folder collaborator grants for in-portal Drive-backed Vault
type: feature
---
**Goal:** Members of a household share one vault. Households inside the same family DO NOT share vaults — strict isolation. Outside professionals (lawyer/accountant/executor/POA) get scoped, time-boxed, fully-audited access. Drive itself is never exposed.

**Per-household root:** `households.vault_root_folder_id` is the only Drive folder a household's members (or their collaborators) can ever reach. Every contact in that household resolves to the same root via portal session. Legacy per-contact `contacts.vault_root_folder_id` still works as a fallback for orphan contacts.

Routes:
- `/vault/household/:householdId` — canonical, staff entry from `/households` row.
- `/vault/:contactId` — legacy; auto-redirects to `/vault/household/{contact.household_id}`.
- `/vault/guest/:token` — collaborator landing.
- Sovereign Portal: `<PortalVault>` tab inside `/portal` — read-only, uses `vault-service` `getRoot` + `listFolder` + `streamFile` with `x-portal-token`. Files filtered by `client_visible=true` server-side.

`vault-service` actions all run `ensureAccess(actor, driveId)` which walks ancestors and confirms an allowed root appears. `getRoot` action returns `{rootFolderId, rootName}` for client portal entry.

**Actor types:**
- `staff` — Bearer JWT (`auth.getUser()`); no firewall.
- `client` — `x-portal-token` → `portal_tokens` → `contacts.household_id` → `households.vault_root_folder_id` (falls back to legacy contact root). Also enforces per-file `vault_files.client_visible`.
- `collaborator` — `x-vault-guest-token` + unlock code → `vault_collaborators` (now scoped by `household_id`) → active `vault_collaborator_grants`.

**Tables (key columns):**
- `households.vault_root_folder_id text`
- `vault_collaborators(household_id, contact_id, email, full_name, role, revoked_at)` — unique on `(household_id, email)`.
- `vault_collaborator_grants(collaborator_id, scope_type 'folder'|'file', drive_id, permission 'view'|'upload', expires_at default+30d, revoked_at)`.
- `vault_files(household_id, contact_id, drive_id, ancestor_folder_ids, client_visible, staff_reviewed, ...)`.
- `vault_audit_log(household_id, actor_type, actor_id, action, drive_id, ip, user_agent, metadata)`.

**Provisioning:** `provisionVault` accepts `householdId` (preferred) or `contactId` (resolves to its household). Drive folder named `ProsperWise Vault — {Family} ({Household label if not Primary})`.

**Revocation = instant:** flip `revoked_at` on collaborator or grant; next request 403s. Drive ACLs never granted to outside parties.

**PIPEDA:** Drive bytes only ever decrypted inside Montreal Edge Function. No Drive URLs leave the server.
