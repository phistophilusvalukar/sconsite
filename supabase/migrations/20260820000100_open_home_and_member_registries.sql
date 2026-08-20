/*
  # Open the public homepage and member registries

  - Publishes the homepage.
  - Enables the character, citizen, and guild registries for authenticated members.
  - Route authentication remains enforced by Supabase Auth and table RLS.
*/

INSERT INTO public.site_pages (page_key, is_enabled)
VALUES
  ('home', true),
  ('characters', true),
  ('citizens', true),
  ('guilds', true)
ON CONFLICT (page_key) DO UPDATE
SET
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now(),
  updated_by = NULL;
