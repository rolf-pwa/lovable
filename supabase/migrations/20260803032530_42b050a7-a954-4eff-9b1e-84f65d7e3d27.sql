ALTER TABLE public.services ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE public.services s
SET slug = base.candidate
FROM (
  SELECT id,
         regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')
           || CASE WHEN row_number() OVER (PARTITION BY regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') ORDER BY created_at) > 1
                   THEN '-' || (row_number() OVER (PARTITION BY regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') ORDER BY created_at))::text
                   ELSE '' END AS candidate
  FROM public.services
) base
WHERE s.id = base.id AND (s.slug IS NULL OR s.slug = '');

CREATE UNIQUE INDEX IF NOT EXISTS services_slug_key ON public.services (slug) WHERE slug IS NOT NULL;