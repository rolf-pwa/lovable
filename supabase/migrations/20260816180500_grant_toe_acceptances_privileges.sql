-- RLS policies alone aren't sufficient here — this project also requires
-- explicit GRANTs per table (confirmed by testing: anon INSERT failed with
-- "new row violates row-level security policy" despite a matching INSERT
-- policy, until granted). Matches the existing service_bookings pattern:
-- anon can insert, not read; staff can read, not insert.
GRANT INSERT ON public.toe_acceptances TO anon;
GRANT SELECT ON public.toe_acceptances TO authenticated;
GRANT ALL ON public.toe_acceptances TO service_role;
