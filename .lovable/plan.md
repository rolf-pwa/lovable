## Client-Facing Vault (Sovereign Portal)

Surface the household-scoped vault inside the Sovereign Portal as a new tab — read-only for clients, with the existing `client_visible` firewall enforced server-side.

### What clients will see

A new **Vault** tab next to Tasks / Updates / Requests / Meetings / Messages.

```text
┌─ Vault ─────────────────────────────────────────────┐
│ ▸ ProsperWise Vault — Smith Family                  │
│   📁 Charters                                        │
│   📁 Tax Returns                                     │
│   📁 Estate Documents                                │
│   📄 2024 Charter Ratified.pdf      View · Download │
│   📄 Will — Joan Smith.pdf          View · Download │
└─────────────────────────────────────────────────────┘
Empty state: "Your Personal CFO has not shared any documents yet."
```

- Folder breadcrumbs + click-to-descend navigation.
- Icons differentiate folders vs files; PDFs show a "View" action that opens an in-portal viewer (signed bytes streamed through the edge function — no Drive URLs leak).
- "Download" streams the file through the edge function with a 60s in-memory blob URL.
- Hidden files (no `client_visible=true`) are filtered server-side and never appear.
- No upload, no rename, no delete — strictly read-only for v1.

### Component plan

New file: `src/components/portal/PortalVault.tsx`
- Props: `{ portalToken: string; householdId: string; familyName: string; householdLabel?: string }`
- State: `currentFolderId` (defaults to vault root), `entries`, `breadcrumbs`, loading/error.
- Calls `vault-service` with `x-portal-token` header (already supported as `client` actor).
- Actions used: `list` (folders + files), `download` (returns base64 → blob).

`src/pages/Portal.tsx` changes:
- Add `TabsTrigger value="vault"` with FolderLock icon.
- Add `TabsContent value="vault"` rendering `<PortalVault />` only when `data.contact.household_id` exists and the household has a provisioned vault.
- Conditionally hide the tab if no vault has been provisioned (avoid dead UX).

### Backend

No new tables or migrations. The existing `vault-service` already handles the `client` actor:
- Resolves `portal_token` → `contact` → `household_id` → `vault_root_folder_id`.
- `ensureAccess()` walks Drive ancestors and rejects anything outside the household root.
- For files, it enforces `vault_files.client_visible = true` (folders always traversable, contents filtered).
- Read-only writes are already rejected (`client_read_only`).

One small backend tweak in `vault-service`:
- Add a lightweight `get_root` action (or extend `list` with no `folderId`) that returns `{ rootFolderId, rootName }` so the portal can render the breadcrumb header without a separate household lookup.

### Security recap (already enforced)

- Cross-household access blocked by ancestor walk.
- Cross-family access impossible — each household has its own root.
- `client_visible=false` files filtered out of `list` and rejected on `download`.
- All access logged in `vault_audit_log` with `actor_type='client'`.
- PIPEDA: bytes streamed only through Montreal edge function.

### Out of scope for this round

- Client uploads (would need a "submit to advisor for review" workflow).
- Collaborator (lawyer/accountant) management UI in the portal.
- Document classification / search.
- Mobile-optimized viewer beyond what shadcn Dialog gives us.

### Files touched

- New: `src/components/portal/PortalVault.tsx`
- Edit: `src/pages/Portal.tsx` (add tab)
- Edit: `supabase/functions/vault-service/index.ts` (add `get_root` action)
- Update: `mem://features/vault-privacy-firewall.md` (note client portal surface live)
