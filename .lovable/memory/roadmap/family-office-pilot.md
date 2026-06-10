---
name: Family Office Pilot Roadmap
description: Future 3-pillar buildout — Tax Planning, Insurance & Risk Register, Philanthropy (ad-hoc) — one-household pilot with hidden Portal tabs
type: feature
---
# Family Office Pilot — Future Buildout

Status: **Planned, not started.** Approved scope, awaiting build kickoff.

## Locked-in scope decisions
- **Insurance broker**: single broker per household, stored as `professional_network` contact.
- **Tax accountant handoff**: Vault share-links only (existing `vault-service` `createShareLink`) via Wix Velo relay. No PII in email body.
- **Philanthropy vehicle**: ad-hoc direct giving — no DAF/foundation entity. `vehicle` column kept on grants for future DAF support.
- **Portal exposure**: all three new tabs ship hidden; flipped per household via Knowledge Base `portal_navigation_links` pattern.
- **Pilot gating**: `households.family_office_pilot boolean default false` gates staff-side tab rendering too.

## Pillar 1 — Tax Planning & Prep Coordination
Tables: `tax_years`, `tax_slips`, `tax_planning_items`.
UI: `/contacts/:id/tax` tab; household "Tax Year" card; hidden Portal "Tax" tab.
Edge: `tax-planner-suggest` (Vertex Gemini 2.5 Flash, Montreal → `review_queue`); extend `drive-watch` with slip classifier; `tax-accountant-handoff` (scoped Vault share-link bundle, Wix Velo email).

## Pillar 2 — Insurance & Risk Register
Tables: `insurance_policies` (policy_number_masked, last 4 only), `insurance_claims`, `insurance_review_log`.
UI: `/contacts/:id/insurance` tab; household "Risk Coverage" card; hidden Portal "Risk Coverage" tab (sanitized — never policy numbers).
Edge: `insurance-renewal-alerts` daily cron at 60/30/14 days.
Adequacy heuristic: Life shortfall = max(0, 10 × HoF_annual_income − total_life_face); Disability shortfall = max(0, 0.65 × HoF_income_to_age_66 − total_disability_monthly × 12).

## Pillar 3 — Philanthropy (ad-hoc)
Tables: `charitable_grants` (vehicle always `direct` for pilot), `cause_priorities`.
UI: `/households/:id/philanthropy`; hidden Portal "Giving" tab.
Auto-link: `charitable_grants.status='receipted'` + `receipt_vault_file_id` → creates `tax_slips` row (`slip_type='charitable_receipt'`) in current `tax_years`.
Edge: `philanthropy-match` (Vertex → `review_queue`).

## Cross-cutting
- All AI suggestions + handoffs write to `sovereignty_audit_trail`.
- PII Shield on every outbound email body.
- Three `knowledge_base` rows of type `portal_nav_link` created `client_visible=false`.
- All new public tables: GRANT to `authenticated` + `service_role`; no `anon`. RLS scoped via household membership (Vault pattern).

## Explicitly NOT in scope
DAF/foundation entity modeling, SideDrawer policy mirroring, Plaid/Open Banking, Will/POA/trust register, monthly auto-report PDF.

## Rollout order (when build starts)
1. Schema + grants + RLS + pilot flag + hidden KB nav rows
2. Insurance UI + renewal cron + adequacy math
3. Tax UI + drive-watch slip classifier + accountant handoff
4. Philanthropy UI + receipt→slip auto-link + `philanthropy-match`
5. Wire Portal tabs (still hidden), surface HITL review queue, flip ON for pilot household

## Memory files to add on completion
`mem://features/tax-planning`, `mem://features/insurance-register`, `mem://features/philanthropy-ledger`, update `mem://features/dashboard` for pilot flag.
