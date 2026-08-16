-- Storehouses had neither an account_number nor a custodian column, unlike
-- vineyard_accounts and holding_tank — that gap blocked Web Form buttons
-- (adobe_webforms) from ever matching a Storehouse account. Adding both so
-- the same custodian-matching logic works identically across Holding Tank,
-- Vineyard, and Storehouses.
ALTER TABLE public.storehouses
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS custodian TEXT;
