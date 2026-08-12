-- Extends stabilization_maps to support household-keyed Sovereignty Survey
-- maps (in addition to the existing per-lead/per-contact maps), plus the
-- quantified diagnostic figures and 3-phase action plan for the advisor UI.
ALTER TABLE public.stabilization_maps
  ADD COLUMN IF NOT EXISTS household_id UUID NULL REFERENCES public.households(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS track_type TEXT NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS diagnostic_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS action_plan JSONB NOT NULL DEFAULT '{"phase_1": [], "phase_2": [], "phase_3": []}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_stabilization_maps_household ON public.stabilization_maps(household_id);
