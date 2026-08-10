ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS relationship_ended_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS relationship_end_reason TEXT,
  ADD COLUMN IF NOT EXISTS retention_flagged_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.households.relationship_ended_at IS
  'When the advisory relationship with this household formally ended. Starts the 7-year Canadian financial-services recordkeeping retention clock. NULL means the relationship is still active. Set by staff via HouseholdDetail; never set automatically.';
COMMENT ON COLUMN public.households.relationship_end_reason IS
  'Optional free-text staff note on why/how the relationship ended (e.g. "Client transferred to another advisor", "Deceased, estate settled"). For audit context only.';
COMMENT ON COLUMN public.households.retention_flagged_at IS
  'Set by the retention-review scheduled job the first time this household crosses the 7-year post-relationship-end retention floor, so the job does not re-notify staff on every run. Cleared automatically when relationship_ended_at is unset (see HouseholdDetail "Reopen Relationship" action).';
