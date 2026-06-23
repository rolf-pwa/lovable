
# Quarterly Account CSV Ingest

Add a "Bulk Account Sync" step to the Quarterly System Review workbench that ingests a CSV of accounts, auto-routes each row to the correct destination by account number, updates balances and metadata, writes BOY/current snapshots for performance math, and stages anything unrecognised in the Holding Tank for later classification.

## Flow

```text
Upload CSV
   │
   ▼
Header mapping (auto-guess + confirm)
   │
   ▼
Lookup account_number across:
   vineyard_accounts → storehouses → holding_tank
   │
   ├── Match ───► Update current_value, metadata (custodian, type) if changed
   │              Insert account_harvest_snapshot (BOY + current, reporting_year)
   │
   └── No match ─► Insert into holding_tank (flagged needs_review)
                   Insert account_harvest_snapshot against the new row
   │
   ▼
Summary screen: matched / updated / staged / errors  +  downloadable report
```

## UI

New page `src/pages/QuarterlyAccountSync.tsx`, linked from a "Bulk Account Sync" button on `QuarterlySystemReview.tsx`.

Three steps reusing the pattern from `ContactCsvImport.tsx`:
1. **Upload** — drag/drop CSV.
2. **Map columns** — auto-guess headers (account number, client name, custodian, account type, BOY balance, current balance, as-of date); user confirms required fields (account number, current balance, BOY balance, as-of date).
3. **Preview & confirm** — table of first 20 rows showing detected destination (Vineyard / Storehouse / Holding Tank / NEW → Holding Tank) and a totals strip. "Run sync" button commits.

Post-run summary card: counts by destination, list of staged-as-new rows with a link to the Holding Tank, downloadable CSV of any rows that failed validation.

## Matching rules

- Key: normalised `account_number` (trim, strip spaces and dashes, uppercase).
- Lookup order: `vineyard_accounts` → `storehouses` → `holding_tank`. First hit wins.
- Conflict (same number in two tables) → row goes to error report, not auto-applied.
- Unmatched → insert into `holding_tank` with `needs_review = true`, copying client name, custodian, account type, balances.

## Writes per matched row

- Update `current_value` to CSV current balance.
- Patch `custodian` and `account_type` only when CSV provides a non-empty value that differs.
- Insert one `account_harvest_snapshots` row with `snapshot_date` = CSV as-of date, `boy_value`, `current_value`, and the correct `vineyard_account_id` / `storehouse_id` / `holding_tank_id` (the existing DB trigger enforces exactly one and back-fills `reporting_year` + `contact_id` check).

## Backend

New edge function `quarterly-account-sync` (service-role) that accepts the parsed + mapped rows and performs all writes in a single batched transaction-style sequence, returning per-row results. Keeps RLS-sensitive table writes off the client and lets us reuse the same logic if we later add a scheduled importer.

## Out of scope (flag for a follow-up)

- Mapping by custodian + account number pair.
- Auto-classification of staged Holding Tank rows into Vineyard/Storehouse (still a manual review step).
- Multi-quarter back-fill in one upload — this run targets a single as-of date per file.
