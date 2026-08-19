-- insurance_policies.visibility_scope defaulted to 'household', but every
-- scope check in the app (portal + CRM) compares against the actual enum
-- values used by vineyard_accounts/storehouses/holding_tank: 'private',
-- 'household_shared', 'family_shared'. Any policy still on its DB default
-- silently failed every household_shared/family_shared filter. Correct the
-- default going forward and backfill existing rows still on the stale value.

ALTER TABLE public.insurance_policies
  ALTER COLUMN visibility_scope SET DEFAULT 'household_shared';

UPDATE public.insurance_policies
  SET visibility_scope = 'household_shared'
  WHERE visibility_scope = 'household';
