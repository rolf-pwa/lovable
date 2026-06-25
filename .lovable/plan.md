# Monthly Governance Review — Build Plan

Extend the existing Periodic Account Review (Performance Engine) with a Verification layer and a new Charter Alignment Engine, then surface both in a unified "Monthly Governance Review" object. The existing reconciliation flow stays untouched; we layer on top.

## Architecture

```text
Periodic Review (today)            NEW
─────────────────────────         ────────────────────────────────
Upload → Map → Preview →   ──►   [Verification Layer]
Resolve → Commit                  stale-date / variance /
   │                              unresolved exception checks
   ├─ live balances                       │
   ├─ account_harvest_snapshots           ▼
   └─ sovereignty_audit_trail     [Charter Alignment Engine]
                                  retrieve charter sections →
                                  compare facts vs principles
                                          │
                                          ▼
                                  monthly_governance_reviews
                                  (status pipeline)
                                          │
                                          ▼
                                  Briefing Pack (advisor/principal)
```

State machine on each monthly review row:
`ingested → committed → verified → charter_checked → approved_for_reporting`

## Scope (this build)

1. **Verification Layer** (post-commit, deterministic)
   - New edge function `governance-verify` that, given `(household_id|contact_id, period)`, scans `account_harvest_snapshots` + live balances for that month and emits findings:
     - Stale snapshot (no row for any tracked account in the period)
     - Material variance vs prior period (> configurable %)
     - Unresolved holding-tank rows / unmatched CSV remnants
     - Missing as-of date / null values
   - Findings written to `governance_review_findings` (jsonb per finding, severity, account ref).
   - Auto-invoked at the end of `quarterly-account-sync` commit, and re-runnable from UI.

2. **Charter Intelligence Layer**
   - New table `charter_sections`: `(id, charter_id, contact_id, section_key, title, body, ordinal, embedding vector(768), updated_at)`.
   - One-time + on-charter-update edge function `charter-index` that chunks `sovereignty_charters` rows by section (liquidity policy, governance, decision rules, capital purpose, vision, etc.) and stores rows. Use Lovable AI Gateway `google/text-embedding-004` for embeddings (Montréal-pinned via existing Vertex helper).
   - Retrieval helper: given a performance fact (e.g. "Vineyard down 12%"), return top-k cited sections.

3. **Charter Alignment Engine**
   - New edge function `governance-align` that, for each verified performance fact in the period, retrieves relevant charter sections and asks Gemini 2.5 Flash to classify `aligned | exception | needs_review` with a one-sentence rationale and a charter citation.
   - Writes rows to `governance_alignment_results` matching the comparison schema from the blueprint:
     `review_period, household_or_entity, performance_fact, charter_principle, alignment_status, evidence_source, exception_reason, recommended_action`.

4. **Monthly Governance Review object**
   - New table `monthly_governance_reviews` keyed by `(scope_type, scope_id, period_end)` with the status pipeline above, plus aggregate counts (aligned / exceptions / needs_review), `verified_at`, `charter_checked_at`, `approved_by`, `approved_at`.
   - Children: `governance_review_findings`, `governance_alignment_results`.

5. **Briefing Generator**
   - Edge function `governance-briefing` that reads ONLY an `approved_for_reporting` review object and emits a markdown briefing (advisor note + principal note variant). Hard rule: it never touches raw uploads or unapproved rows.

6. **UI**
   - New page `/workbench/governance-review` (or tab inside existing Quarterly Review) with three steps after Commit:
     a. **Verify** — finding list with severity, ack/resolve actions.
     b. **Charter Alignment** — table of facts × charter principles with status chips and citation popovers; advisor can override status + add note.
     c. **Approve & Brief** — gate to mark `approved_for_reporting`, then "Generate Briefing" producing markdown preview + copy/download.
   - Surface a "Latest Governance Review" card on `/households/:id` and `/families/:id`.

## Data model (migration)

```sql
-- charter chunks (pgvector already used elsewhere? if not, fall back to jsonb text + lexical retrieval)
create table public.charter_sections (...);

create table public.monthly_governance_reviews (
  id uuid pk, scope_type text, scope_id uuid, period_end date,
  status text default 'ingested',
  counts jsonb default '{}'::jsonb,
  verified_at timestamptz, charter_checked_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  briefing_markdown text,
  created_at, updated_at
);

create table public.governance_review_findings (
  id, review_id fk, severity text, code text, account_ref jsonb,
  message text, status text default 'open', created_at
);

create table public.governance_alignment_results (
  id, review_id fk,
  performance_fact jsonb,
  charter_section_id fk, charter_principle text,
  alignment_status text, exception_reason text,
  recommended_action text, evidence_source jsonb,
  advisor_override text, advisor_note text, created_at
);
```
All four tables: `GRANT` to `authenticated` + `service_role`, RLS scoped to staff (existing pattern), advisor-only writes.

## Out of scope (defer)

- Auto-creating Asana action tasks from findings/recommendations (hook ready, wired later).
- Client portal exposure of the briefing (staff-only first).
- Replacing the existing `quarterly_system_reviews` flow — that stays as the per-contact narrative; the new object is period-scoped and household/family aware.

## Open questions

1. **Scope** — should reviews be generated at **household** level (matches AUM tiles) or **contact** level (matches existing quarterly_system_reviews)? Blueprint says "household_or_entity"; I'd default to household with optional contact rollup.
2. **Variance thresholds** — default to ±10% MoM and stale > 35 days, configurable per family later?
3. **Charter chunking** — Sovereignty Charters today are stored as long-form fields in `sovereignty_charters`. Want me to chunk by the existing field groups (purpose, vision, liquidity, governance, etc.) or introduce a true section parser?
4. **Briefing destination** — markdown preview + copy only for v1, or also save as a Google Doc via the existing `google-docs` function?

Confirm answers (or "use defaults") and I'll build.
