
# VFO Professionals Integration

Bring outside professionals (lawyer, accountant, insurance broker, executor, POA, etc.) into the Virtual Family Office as first-class participants. Pros get a scoped read-only portal login plus a collaboration thread per engagement. Every share, message, and document hand-off is recorded as a formal **engagement** with audit trail. Hidden behind `households.family_office_pilot` until ready.

## Architecture

```text
Staff (CRM)                    Pro (Pro Portal — OTP)
───────────                    ──────────────────────
ProfessionalLinker  ──►        /pro-portal
  attaches pro to                 ├─ Engagements list (scoped)
  family/household                ├─ Engagement detail
        │                         │    ├─ Scope + status
        ▼                         │    ├─ Shared Vault files (read-only)
  Engagement created              │    └─ Message thread
  ├─ scope (pillar: tax/legal/    └─ Profile
  │  insurance/philanthropy/
  │  estate/other)              VFO Portal (client)
  ├─ vault_share_link bundle     ├─ "Your Team" sidebar card
  ├─ pro_portal_token (OTP)      └─ "Professionals" tab
  └─ sovereignty_audit_trail          (read-only, sees pro + engagement status)
```

State machine on each engagement:
`draft → invited → active → completed → archived` (+ `revoked` from any state).

## Data Model (migration)

Four new tables, all pilot-gated, all GRANT'd to `authenticated` + `service_role`, RLS scoped via staff role or pro token claim.

```sql
-- 1. Pro identity (one row per outside professional)
create table public.professionals (
  id uuid pk,
  contact_id uuid references contacts(id),    -- reuse existing pro_network contact
  email text not null,
  full_name text not null,
  firm text,
  professional_type text not null,            -- lawyer | accountant | insurance_broker | executor | poa | financial_planner | other
  credentials text,                           -- e.g. "CPA, CA"
  phone text,
  pro_portal_enabled boolean default false,
  last_login_at timestamptz,
  created_at, updated_at
);

-- 2. Engagement = formal work-order linking a pro to a family/household/contact
create table public.professional_engagements (
  id uuid pk,
  professional_id uuid references professionals(id),
  scope_type text,                            -- family | household | contact
  scope_id uuid,
  pillar text,                                -- tax | legal | insurance | estate | philanthropy | governance | other
  title text not null,                        -- e.g. "2026 Tax Filing"
  description text,
  status text default 'draft',
  vault_share_link_id uuid references vault_share_links(id),
  started_at timestamptz, completed_at timestamptz,
  created_by uuid, created_at, updated_at
);

-- 3. Threaded messages between staff <-> pro <-> (optional) client
create table public.engagement_messages (
  id uuid pk,
  engagement_id uuid references professional_engagements(id) on delete cascade,
  sender_type text,                           -- staff | pro | client
  sender_id uuid,
  body text not null,
  attachments jsonb default '[]'::jsonb,      -- vault_file_id references only
  read_by_staff_at timestamptz,
  read_by_pro_at timestamptz,
  created_at
);

-- 4. Pro portal OTP tokens (mirrors portal_tokens pattern)
create table public.pro_portal_tokens (
  id uuid pk,
  professional_id uuid references professionals(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  device_fingerprint text,
  created_at
);
```

All writes mirror to `sovereignty_audit_trail`. PII Shield runs on every outbound `engagement_messages.body` before Wix relay.

## Edge Functions (new)

- `pro-portal-otp` — request + verify OTP for `professionals.email`; issues short-lived JWT scoped to `professional_id`.
- `pro-portal-engagements` — list/get engagements; resolves Vault share-link contents for the JWT subject only.
- `engagement-message-send` — staff or pro sends a message; PII Shield + Wix relay notification to the other party.
- `engagement-create-handoff` — staff one-click: creates engagement + scoped Vault share-link bundle + invites pro via Wix email.
- Extend `vault-service` with `proPortalReadFile` action gated by pro JWT.

## Staff CRM Surface

- **Extend `ProfessionalLinker`** so adding a pro now also offers "Create engagement" (pillar + scope picker + initial Vault files).
- New page `/professionals` — directory of all pros, filterable by pillar + last engagement.
- New page `/professionals/:id` — pro detail with engagement history + audit trail.
- New tab on `/families/:id`, `/households/:id`, `/contacts/:id` → **Professionals** listing engagements at that scope.
- Inbox-style **Engagement Threads** widget on staff dashboard for unread pro messages.

## VFO Portal Surface (client-facing, pilot-only)

- **"Your Team" sidebar card** on `/vfo/:familyId` — collapsible card listing each pro: avatar, role, firm, last engagement, "View" button.
- **New "Professionals" tab** on the VFO portal — full table of pros + open/completed engagements + status chips. Read-only. No message bodies exposed (privileged work product).
- **Per-pillar attachment**:
  - Tax tab → accountant card
  - Charter/Legacy tab → lawyer + executor card
  - Risk Coverage tab → insurance broker card
  - Giving tab → (future) DAF advisor card

## Pro Portal (new)

- Route: `/pro-portal/*` (OTP login on `/pro-portal/login`).
- Theme: lighter, neutral — separate visual identity from client Sanctuary theme.
- Pages:
  - **Engagements list** — only engagements where `professional_id = jwt.sub`.
  - **Engagement detail** — scope summary, shared Vault files (download via signed proxy), message thread.
  - **Profile** — pro updates own contact info; staff approval required for changes that mutate `contacts` record.
- 5-min inactivity logout (matches client portal).
- No access to: AUM figures, charter, family tree, or any other engagement.

## Pilot Gating

- All staff UI tabs render only when `households.family_office_pilot = true` (or any household in the family/contact lineage is flagged).
- VFO Portal tabs hidden via existing `portal_navigation_links` knowledge_base pattern (`client_visible=false` by default).
- Pro portal itself is always on once enabled (an invited pro from any pilot household can log in).

## Compliance

- Wix Velo relay for every pro-bound email (no PII in body — links only).
- PII Shield blocks SIN/health data in messages.
- Vault share-links scoped per engagement; revocable; expire on `completed`.
- Pro portal token storage and 5-min timeout match existing `portal_tokens` security model.
- All AI-suggested handoffs (Tier 2 roadmap) write to `review_queue` for HITL approval.

## Out of Scope (defer)

- AI-generated engagement summaries / scope drafts (hook ready in `engagement-create-handoff`).
- Pro billing/invoicing module.
- Real-time chat (polling on a 30s interval for v1).
- E-signature inside the pro portal (continue using existing `charter-esign-*` for now).
- Calendar/Meet integration for pro<>staff meetings (use existing Google Calendar flow).

## Rollout Order

1. ✅ Schema + grants + RLS + pilot flag gating.
2. ✅ Staff: `/professionals` directory + `ProfessionalDetail` engagement creation.
3. Engagement creation flow + Vault share-link bundling (deferred — share-link binding TBD).
4. ✅ Pro portal scaffold (OTP via Gmail relay + engagements list + read-only Vault placeholder).
5. ✅ Threaded messaging (`engagement_messages` + Gmail relay notifications via `send-admin-email`). **Note: Wix relay replaced with Gmail relay per latest direction.**
6. VFO Portal "Your Team" card + Professionals tab + per-pillar attachments.
7. Flip pilot ON for one household, observe, iterate.

## Open Questions

1. **Multiple engagements per pro** — a household's accountant may have a tax engagement *and* a corp-reorg engagement. Confirm we want N engagements per (pro × scope) rather than a single rolling relationship.
2. **Client visibility of message bodies** — current plan hides bodies from the client (privileged work product). Acceptable, or should the client see threads they're tagged in?
3. **Pro-initiated requests** — can a pro create a request/task for staff, or only reply within an engagement thread staff opened?
4. **Notification channel** — Wix email only, or also fire `staff_notifications` bell when a pro replies?

Confirm answers (or "use defaults" — N engagements per pro, client sees status only, pros reply-only, both Wix + staff bell) and I'll build.
