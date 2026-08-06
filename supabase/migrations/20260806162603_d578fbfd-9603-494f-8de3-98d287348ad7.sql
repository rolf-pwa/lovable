ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS onboarding_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.households.onboarding_enabled IS 'When true the household sees the guided Sovereignty Audit onboarding in the portal. Legacy clients are false.';

UPDATE public.households h
SET onboarding_enabled = false
WHERE h.audit_booked_at IS NULL
  AND COALESCE(h.onboarding_step, 1) <= 1
  AND h.profile_completed_at IS NULL
  AND h.onboarding_completed_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.contacts c
    JOIN public.service_bookings b ON b.contact_id = c.id AND b.payment_status = 'paid'
    WHERE c.household_id = h.id
  );