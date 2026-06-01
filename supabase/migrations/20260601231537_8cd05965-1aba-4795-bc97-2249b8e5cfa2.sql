ALTER TABLE public.account_harvest_snapshots
  ADD COLUMN IF NOT EXISTS ror_ytd numeric,
  ADD COLUMN IF NOT EXISTS ror_6m numeric,
  ADD COLUMN IF NOT EXISTS ror_1y numeric,
  ADD COLUMN IF NOT EXISTS ror_3y numeric,
  ADD COLUMN IF NOT EXISTS ror_5y numeric,
  ADD COLUMN IF NOT EXISTS ror_since_inception numeric;