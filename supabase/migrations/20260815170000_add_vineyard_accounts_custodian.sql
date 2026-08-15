-- Preliminary work for the Adobe Sign carrier form prefill roadmap item:
-- vineyard_accounts (where accounts live once graduated from the Holding
-- Tank) has never had a custodian field, unlike holding_tank. Without it,
-- there's no way to tell which accounts are directly managed by ProsperWise
-- (iA Financial Group, JustWealth) versus tracked-only assets for AUM
-- tiering (Phase 3) or reliably matching a row to a specific carrier policy
-- (Phase 5).
ALTER TABLE public.vineyard_accounts
  ADD COLUMN IF NOT EXISTS custodian TEXT;
