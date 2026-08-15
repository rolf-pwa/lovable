-- Marks a household as an existing-client "upgrade" enrollment (staff-triggered
-- via HouseholdDetail.tsx's "Enroll in Guided Intake" action), as opposed to a
-- brand-new lead who signed up and paid through the normal Square checkout flow.
-- Read by intake-portal's Step 3 to swap the "wealth event" framing (which
-- assumes a new triggering event) for a vision/values/purpose conversation,
-- which is what actually applies when an existing client formalizes their
-- Sovereignty Operating System.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS legacy_intake_upgrade BOOLEAN NOT NULL DEFAULT false;
