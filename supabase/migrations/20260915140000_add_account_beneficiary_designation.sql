-- Captures each account's beneficiary designation as real, structured,
-- one-time-captured CRM data -- confirmed with Rolf: rather than
-- re-extracting it from a statement PDF every quarter (a bottleneck as the
-- VFO scales), it's entered once as part of the account-setup SOP (or as a
-- one-time backfill for pre-existing accounts) and persists like any other
-- account field, the same way account_number/custodian already do. This is
-- what lets the Quarterly Governance Audit's estate-liquidity check
-- (governance-audit-estate.ts) build a real EstateAsset list directly from
-- these tables instead of a statement-derived one, closing the gap flagged
-- when that module was first ported.
--
-- insurance_policies already has primary_beneficiary/contingent_beneficiary
-- (added earlier) -- no change needed there. holding_tank is deliberately
-- excluded: those rows are explicitly "not yet assigned to a pillar," so
-- building estate-liquidity assumptions on them would be premature -- the
-- advisor moves an account into a real Storehouse/Vineyard first, and the
-- move-insert flows already carry this field forward when that happens.

ALTER TABLE public.vineyard_accounts
  ADD COLUMN beneficiary_designation TEXT;

ALTER TABLE public.storehouses
  ADD COLUMN beneficiary_designation TEXT;

ALTER TABLE public.holding_tank
  ADD COLUMN beneficiary_designation TEXT;
