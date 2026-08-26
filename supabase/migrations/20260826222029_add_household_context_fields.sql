-- Psychological & relational intake layer — new-lead flow only, personal
-- sudden-wealth events only (inheritance/divorce/retirement/other_sudden_wealth,
-- not business_exit/business_growth). Split into separate columns (not one
-- JSONB blob), matching the vision/values/purpose convention
-- (20260815160000_...sql), so each can be read/quoted independently downstream.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS anchor_transfer_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS anchor_transfer_amount_note TEXT,
  ADD COLUMN IF NOT EXISTS spousal_alignment_score SMALLINT,
  ADD COLUMN IF NOT EXISTS spousal_alignment_note TEXT,
  ADD COLUMN IF NOT EXISTS pressure_types TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS pressure_note TEXT,
  ADD COLUMN IF NOT EXISTS pending_capex_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS pending_capex_date DATE,
  ADD COLUMN IF NOT EXISTS pending_capex_description TEXT,
  ADD COLUMN IF NOT EXISTS legacy_advisor_friction_notes TEXT,
  ADD COLUMN IF NOT EXISTS household_context_completed_at TIMESTAMP WITH TIME ZONE;
