-- The partial unique index (WHERE professional_id IS NOT NULL) can't be
-- targeted by a plain `ON CONFLICT (household_id, professional_id)` clause
-- (what supabase-js's .upsert({onConflict: "household_id,professional_id"})
-- generates) -- caught live via a real upsert attempt. Fix: drop the WHERE
-- clause entirely. It was never needed: Postgres already treats every NULL
-- as distinct from every other NULL in a unique index, so guest-invited
-- rows (professional_id IS NULL) never collided with each other even
-- without the partial predicate -- only real duplicate (household_id,
-- professional_id) pairs get rejected, which is exactly what we want.

DROP INDEX public.vault_collaborators_household_professional_key;

CREATE UNIQUE INDEX vault_collaborators_household_professional_key
  ON public.vault_collaborators(household_id, professional_id);
