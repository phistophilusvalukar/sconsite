/* Remove the independently editable character-profile section color. */

DROP FUNCTION IF EXISTS public.update_character_profile_v10_command(uuid, jsonb, boolean, jsonb);

DROP FUNCTION IF EXISTS public.get_public_character_profile(uuid);

ALTER FUNCTION public.get_public_character_profile_without_section_color(uuid)
  RENAME TO get_public_character_profile;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_section_color_check,
  DROP COLUMN IF EXISTS profile_section_color;

NOTIFY pgrst, 'reload schema';
