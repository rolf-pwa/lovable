
-- Add holding_tank_id column to account_harvest_snapshots
ALTER TABLE public.account_harvest_snapshots
  ADD COLUMN holding_tank_id UUID REFERENCES public.holding_tank(id) ON DELETE CASCADE;

-- Update validation trigger to accept exactly one of vineyard_account_id, storehouse_id, or holding_tank_id
CREATE OR REPLACE FUNCTION public.validate_account_harvest_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  vineyard_contact_id UUID;
  storehouse_contact_id UUID;
  holding_tank_contact_id UUID;
BEGIN
  IF ((NEW.vineyard_account_id IS NOT NULL)::INT + (NEW.storehouse_id IS NOT NULL)::INT + (NEW.holding_tank_id IS NOT NULL)::INT) <> 1 THEN
    RAISE EXCEPTION 'Each harvest snapshot must reference exactly one account source';
  END IF;

  IF NEW.vineyard_account_id IS NOT NULL THEN
    SELECT contact_id INTO vineyard_contact_id
    FROM public.vineyard_accounts
    WHERE id = NEW.vineyard_account_id;

    IF vineyard_contact_id IS NULL THEN
      RAISE EXCEPTION 'Referenced Vineyard account was not found';
    END IF;

    IF NEW.contact_id <> vineyard_contact_id THEN
      RAISE EXCEPTION 'Snapshot contact does not match the Vineyard account owner';
    END IF;
  END IF;

  IF NEW.storehouse_id IS NOT NULL THEN
    SELECT contact_id INTO storehouse_contact_id
    FROM public.storehouses
    WHERE id = NEW.storehouse_id;

    IF storehouse_contact_id IS NULL THEN
      RAISE EXCEPTION 'Referenced Storehouse account was not found';
    END IF;

    IF NEW.contact_id <> storehouse_contact_id THEN
      RAISE EXCEPTION 'Snapshot contact does not match the Storehouse owner';
    END IF;
  END IF;

  IF NEW.holding_tank_id IS NOT NULL THEN
    SELECT contact_id INTO holding_tank_contact_id
    FROM public.holding_tank
    WHERE id = NEW.holding_tank_id;

    IF holding_tank_contact_id IS NULL THEN
      RAISE EXCEPTION 'Referenced Holding Tank entry was not found';
    END IF;

    IF NEW.contact_id <> holding_tank_contact_id THEN
      RAISE EXCEPTION 'Snapshot contact does not match the Holding Tank owner';
    END IF;
  END IF;

  NEW.reporting_year := EXTRACT(YEAR FROM NEW.snapshot_date)::INTEGER;
  RETURN NEW;
END;
$$;

-- Unique index for holding_tank_id + snapshot_date
CREATE UNIQUE INDEX account_harvest_snapshots_holding_tank_date_idx
  ON public.account_harvest_snapshots (holding_tank_id, snapshot_date)
  WHERE holding_tank_id IS NOT NULL;
