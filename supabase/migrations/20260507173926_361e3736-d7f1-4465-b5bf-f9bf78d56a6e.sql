INSERT INTO public.vault_folder_templates (position, display_name, slug, is_active)
VALUES (0, '00 Shoebox (Client Uploads)', 'shoebox', true)
ON CONFLICT DO NOTHING;