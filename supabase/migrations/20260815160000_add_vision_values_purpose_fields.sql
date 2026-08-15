-- Separate vision/values/purpose fields for the legacy-intake Step 2, replacing
-- the wealth_event_type="vision_values" sentinel approach. Split into 3 columns
-- (rather than one combined note) so each can be read, quoted, or fed into other
-- documents (Sovereignty Charter, Stabilization Survey) independently later.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS vision_notes TEXT,
  ADD COLUMN IF NOT EXISTS values_notes TEXT,
  ADD COLUMN IF NOT EXISTS purpose_notes TEXT;
