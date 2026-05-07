DELETE FROM public.portal_links WHERE link_type = 'sidedrawer';
ALTER TABLE public.contacts DROP COLUMN IF EXISTS sidedrawer_url;