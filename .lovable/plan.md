
# ProsperWise Document Vault — Technical Specification

**Version:** 1.0 · **Owner:** ProsperWise · **Backend:** Google Drive (firm Workspace) proxied through Supabase Edge Functions in `northamerica-northeast1` (Montreal, PIPEDA-pinned).

---

## 1. Purpose & Principles

The Vault is the firm's **only** client-document surface. Drive itself is never exposed — to clients, collaborators, or even staff browsers. Every byte passes through one Edge Function (`vault-service`) that enforces an ancestry firewall.

Hard rules:
1. **Drive is invisible.** No Drive URLs, no Drive ACLs to outside parties — ever.
2. **One vault per household.** Households inside the same family do NOT share vaults (fiduciary isolation).
3. **Default-deny.** Every action revalidates the actor's ancestor chain.
4. **Instant revocation.** Flipping `revoked_at` 403s the next request — no Drive cleanup needed.
5. **PIPEDA pinning.** Bytes decrypt only inside the Montreal Edge Function. Wix Velo relay (PII-Shielded) for client-facing emails.
6. **Everything is audited** to `vault_audit_log` with actor, IP, UA, action, drive_id.

---

## 2. Architecture

```text
              ┌──────────────────────────────────────────────────┐
              │  CRM (staff)   Portal (client)   Guest landing   │
              │   Vault.tsx     PortalVault       VaultGuest     │
              └──────┬─────────────┬────────────────┬────────────┘
                     │ Bearer JWT  │ x-portal-token │ x-vault-{guest|share}-token
                     │             │                │  (+ x-vault-unlock-code)
                     └─────────────┴────────────────┘
                                   │
                       Supabase Edge Function: vault-service
                       (Montreal · single entrypoint · firewall)
                                   │
                  ┌────────────────┼────────────────┐
                  │                │                │
            Supabase DB     Google Drive API    Wix Velo relay
        (state · audit)   (firm Workspace OAuth)  (PII-Shielded email)
```

Single function, action-dispatched (`{ action, ...payload }` over POST). Google access token = firm Workspace ghost user from `google_tokens` (most-recent row, auto-refreshed).

---

## 3. Actors & Authentication

| Actor | Auth header | Resolves to | Firewall basis |
|---|---|---|---|
| `staff` | `Authorization: Bearer <Supabase JWT>` | `auth.users.id` | Bypass — full manage |
| `client` | `x-portal-token` → `portal_tokens` (non-revoked, non-expired) | `contacts.id` + `households.vault_root_folder_id` | Ancestry must include `vaultRootId` |
| `collaborator` | `x-vault-guest-token` + `x-vault-unlock-code` (first use) | `vault_collaborators.id` + active `vault_collaborator_grants[]` | Ancestry must include one grant drive_id |
| `share_link` | `x-vault-share-token` (+ `x-vault-unlock-code` if guest type & not authenticated) | `vault_share_links.id` + `scopeDriveId` | Ancestry must include `scopeDriveId` |

`resolveActor()` checks in this order: collaborator → share-link → portal → staff. First match wins. An authenticated staff/portal session **bypasses** the guest unlock-code prompt on share links (`isAuthenticatedPrincipal`).

Guest token first-use binds the request's `User-Agent` to `vault_guest_tokens.bound_user_agent`; subsequent calls with a different UA are rejected.

---

## 4. Database Schema

| Table | Purpose | Key columns |
|---|---|---|
| `households.vault_root_folder_id` | Per-household Drive root | text (nullable) |
| `contacts.vault_root_folder_id` | Legacy per-contact root (fallback for orphans) | text (nullable) |
| `vault_folder_templates` | Subfolders auto-created on provisioning | `display_name`, `position`, `is_active` |
| `vault_files` | Cached file metadata + control flags | `household_id`, `contact_id`, `drive_id` (uniq), `parent_folder_id`, `ancestor_folder_ids[]`, `is_folder`, `client_visible` (default true), `staff_reviewed`, `uploaded_by_contact_id` |
| `vault_contact_roles` | Baseline client capability per contact | `contact_id`, `role` ∈ {viewer, contributor, manager} |
| `vault_contact_grants` | Per-contact explicit elevations | `contact_id`, `scope_type` ∈ {folder,file}, `drive_id`, `permission` ∈ {view,upload,manage}, `expires_at`, `revoked_at` |
| `vault_collaborators` | Outside professionals scoped to a household | `household_id`, `contact_id`, `email`, `full_name`, `role`, `invited_at`, `revoked_at`. UNIQUE(`household_id`,`email`) |
| `vault_collaborator_grants` | Per-collaborator scoped permissions | `collaborator_id`, `scope_type`, `drive_id`, `permission` ∈ {view,upload}, `expires_at` (default +30d), `revoked_at` |
| `vault_guest_tokens` | Collaborator session tokens | `collaborator_id`, `token`, `unlock_code`, `unlock_verified_at`, `bound_user_agent`, `expires_at`, `revoked` |
| `vault_share_links` | Ad-hoc share URLs (folder or file) | `household_id`, `scope_type`, `drive_id`, `permission` ∈ {view, view_upload, view_upload_download}, `link_type` ∈ {guest, authenticated}, `unlock_code`, `max_uses`, `use_count`, `bound_user_agent`, `expires_at`, `revoked_at` |
| `vault_audit_log` | Immutable activity log | `household_id`, `contact_id`, `actor_type`, `actor_id`, `actor_label`, `action`, `drive_id`, `drive_name`, `ip`, `user_agent`, `metadata` jsonb |

**RLS:** Service-role only for writes; staff-only `SELECT` for inspection tables. All client/collaborator/share-link traffic goes through `vault-service` using the service role.

---

## 5. Firewall: `ensureAccess(actor, driveId, need)`

The single chokepoint every action calls before touching Drive bytes.

1. Build ancestor chain via `getAncestors(driveId)` — DB cache (`vault_files.ancestor_folder_ids`) first, fall back to Drive walk (max depth 12).
2. `chain = [driveId, ...ancestors]`.
3. Branch by actor:
   - **staff** → allow, cap = `manage`.
   - **client** → `chain` must include `vaultRootId`. Then resolve `effectiveClientPermission(contactId, chain)`:
     - Start from baseline `vault_contact_roles.role` (default `viewer`).
     - Walk chain from most-specific outward; first active `vault_contact_grants` row wins (if higher than baseline).
     - For file reads without a `need`: if `vault_files.client_visible === false`, require an explicit grant in chain; else 403 with `not_client_visible`.
   - **collaborator** → at least one active grant's `drive_id` must appear in chain. For uploads, that grant must be `permission='upload'`.
   - **share_link** → chain must include `scopeDriveId`. Upload only if `permission` is `view_upload` or `view_upload_download`.
4. Capability gates for mutating actions:
   | `need` | client | collaborator | share_link |
   |---|---|---|---|
   | `upload` | cap ≥ `upload` | grant `upload` in chain | `view_upload`/`view_upload_download` |
   | `create_folder` | cap = `manage` | denied | denied |
   | `rename` / `delete` | `manage`; or `upload` only if `uploaded_by_contact_id = self` | denied | denied |

Every block writes `firewall_block` to the audit log with `reason`.

---

## 6. Action Surface (single edge function)

Anonymous (no actor required):
- `resolveShareLink({token, unlock_code?})` — returns scope + permission + client name; signals `needs_unlock_code` for guest-type links.
- `requestGuestOtp({token})` — rotates `unlock_code`, emails via Wix Velo (PII-shielded); response masks email.

Staff-only:
- `provisionVault({householdId | contactId, parentFolderId})` — creates `ProsperWise Vault — {Family}{ (Label)}` under `parentFolderId`, seeds subfolders from `vault_folder_templates`, writes `households.vault_root_folder_id`.
- `inviteCollaborator({householdId, email, fullName, role, grants[]})` — creates collaborator + guest token + unlock code, emails link (code sent separately, manual).
- `createShareLink({householdId, scope_type, drive_id, permission, link_type, generate_unlock_code, notify_email?, max_uses?, expires_at?})`.
- `setVisibility({fileId, householdId, clientVisible})` — toggles `vault_files.client_visible`.
- `listGrants` / `updateGrant` / `revokeGrant` for both contact and collaborator grants.

Any actor (firewalled):
- `getRoot` — client portal entry (returns `{rootFolderId, rootName}`).
- `ensureShoebox` — finds/creates `00 Shoebox (Client Uploads)` under household root.
- `listFolder({folderId})` — Drive listing, filtered by actor scope + `client_visible` for clients.
- `streamFile({fileId})` + `?disposition=inline|attachment` — proxies bytes from Drive; sets `Content-Disposition` and `Content-Type` accordingly. Native Google Docs exported per `googleExportMime()`.
- `uploadFile({folderId, fileName, mimeType, base64})` — base64 chunked encode required client-side (`0x8000`-byte windows, no spread operator).
- `createFolder({parentFolderId, name})`, `renameItem({driveId, newName})`, `deleteItem({driveId})` — capability-gated.
- `getEffectivePermission({driveId})` — returns `cap` so portal can show/hide action buttons.
- `myGrants` (collaborator) — list grant roots.

---

## 7. Frontend Surfaces

| Surface | Route(s) | Component | Actor |
|---|---|---|---|
| Staff vault browser | `/vault/household/:householdId` (canonical), `/vault/:contactId` (legacy redirect) | `src/pages/Vault.tsx` | staff |
| Sovereign Portal vault tab | `/portal` → `<PortalVault>` | `src/components/portal/PortalVault.tsx` | client |
| Guest landing | `/vault/guest/:token` (collaborator), `/vault/share/:token` (share link) | `src/pages/VaultGuest.tsx` | collaborator / share_link |

Portal Vault always opens at the household root, surfaces the Shoebox prominently, shows breadcrumbs, and only renders mutating controls when `getEffectivePermission` returns ≥ `upload` / `manage`. Inline preview supported for `application/pdf` and `image/*` via blob URLs (revoked after 60s).

---

## 8. Provisioning & Folder Templates

`provisionVault` creates the Drive root inside a staff-supplied `parentFolderId` (firm's shared drive root) named `ProsperWise Vault — {Family Name}` (+ ` ({Label})` if label ≠ "Primary"), then iterates `vault_folder_templates WHERE is_active ORDER BY position` to create initial subfolders. The Shoebox is created on first portal upload via `ensureShoebox`.

---

## 9. Upload Pipeline

1. Client/staff reads the File via `arrayBuffer()`.
2. Encodes to base64 in `0x8000`-byte chunks (avoid spread-operator stack-limit crashes on large PDFs — Sanctuary core rule).
3. POSTs `{action: "uploadFile", folderId, fileName, mimeType, base64}`.
4. Edge function decodes, multipart-uploads to Drive under `folderId`, writes `vault_files` row with `uploaded_by_contact_id` (when client) and `ancestor_folder_ids`.
5. **Portal hard cap:** 25 MB per file (`MAX_UPLOAD_BYTES`). Staff browser unbounded by app code.
6. Portal client uploads default to the Shoebox; folder-level uploads only available where `cap ≥ upload`.

---

## 10. Sharing Flows

**Collaborator (lawyer/accountant/executor/POA):**
1. Staff `inviteCollaborator` → row in `vault_collaborators` + `vault_guest_tokens` (24 h initial, code regenerable).
2. Wix Velo emails the `/vault/guest/{token}` URL (link only — unlock code shared via separate channel).
3. Staff attaches `vault_collaborator_grants` to specific folders/files (default 30-day expiry).
4. Guest opens link → submits unlock code → token binds to User-Agent → sees only their grant roots → audited reads/uploads.

**Ad-hoc share link:**
- Staff hits Copy icon on any folder/file → `createShareLink` with `permission` of choice, optional `notify_email` (sends link only via Wix), optional `max_uses` and `expires_at`.
- Guest landing page resolves scope, prompts for unlock code if `link_type='guest'`.
- Authenticated staff/portal sessions bypass the unlock-code prompt.

---

## 11. Audit & Compliance

Every action writes one row to `vault_audit_log` with:
`{household_id, contact_id, actor_type, actor_id, actor_label, action, drive_id, drive_name, ip (x-forwarded-for), user_agent, metadata}`.

Actions logged: `provision`, `list`, `stream`, `upload`, `create_folder`, `rename`, `delete`, `set_visibility`, `invite_collaborator`, `vault_invite_email_sent`, `share_link_created`, `share_link_email_sent`, `share_link_redeemed`, `vault_collaborator_otp_sent`, `firewall_block` (with `reason`), grant CRUD.

PII Shield (`supabase/functions/_shared/pii-shield.ts`) wraps every Wix Velo send. Hits → log + drop (never leaves Canadian infra).

---

## 12. Failure Modes & Edge Cases

- **No Google token** → `no_google_token` 400 (all actions). Staff must reconnect Workspace via `/google-auth`.
- **Token refresh race** → `getValidGoogleToken` refreshes when expiry ≤ now+60s, writes back to `google_tokens`.
- **Orphan contact** (no household_id) → falls back to legacy `contacts.vault_root_folder_id`.
- **Ancestor walk depth > 12** → breaks; chain stops there (defensive cap on Drive shenanigans).
- **Guest UA drift** → 401; user must `requestGuestOtp` to reset.
- **Share link exhausted** (`use_count ≥ max_uses`) → 410 `use_limit_reached`.
- **Vault not provisioned** → portal renders "Personal CFO will set this up" empty state.

---

## 13. Security Posture (what should never happen)

- A client must never see another household's files, even within the same family.
- A collaborator must never see anything outside their explicit grants.
- A share link must never escalate beyond `permission` or escape `scopeDriveId`.
- A revoked collaborator/grant/share link must 403 within the next request.
- No Drive URL, file ID for an out-of-scope file, or raw access token may ever appear in a client response payload.
- No client-facing email may contain financial PII (PII Shield enforced).

---

## 14. Open Roadmap Items (out of scope for v1, listed for reference)

- Bulk download (zip) for collaborators with multiple grant roots.
- Server-side virus scan before upload finalize.
- Watermarked PDF streaming for share-link previews.
- Vault → SideDrawer mirroring for the Vault-of-Record protocol.
- Cron-driven `ancestor_folder_ids` backfill for newly moved files.

---

*This is the complete v1 spec of the deployed Vault. Pair it with `mem://features/vault-privacy-firewall` for the in-codebase summary. Once Agentic Ops integration ships, the Vault becomes the canonical destination for `render-agent-pdf` outputs via the `charter-source-uploads` → `sovereignty_charter_sources` pipeline (see `.lovable/plan.md`).*
