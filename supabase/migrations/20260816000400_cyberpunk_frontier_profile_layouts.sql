/* Add Cyberpunk and Frontier layouts to protected character and guild profiles. */

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_layout_style_check,
  ADD CONSTRAINT characters_profile_layout_style_check CHECK (
    profile_layout_style IN ('chronicle', 'dossier', 'spotlight', 'saga', 'cyberpunk', 'frontier')
  );

ALTER TABLE public.guilds
  DROP CONSTRAINT IF EXISTS guilds_layout_style_check,
  ADD CONSTRAINT guilds_layout_style_check CHECK (
    layout_style IN ('chronicle', 'stronghold', 'banner', 'saga', 'cyberpunk', 'frontier')
  );

DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.update_character_profile_command(uuid,jsonb)'::regprocedure)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    'v_layout NOT IN (''chronicle'', ''dossier'', ''spotlight'', ''saga'')',
    'v_layout NOT IN (''chronicle'', ''dossier'', ''spotlight'', ''saga'', ''cyberpunk'', ''frontier'')'
  );

  IF position('''cyberpunk'', ''frontier''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend character profile layout validation';
  END IF;
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.update_guild_profile_command(uuid,jsonb)'::regprocedure)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    'v_layout NOT IN (''chronicle'', ''stronghold'', ''banner'', ''saga'')',
    'v_layout NOT IN (''chronicle'', ''stronghold'', ''banner'', ''saga'', ''cyberpunk'', ''frontier'')'
  );

  IF position('''cyberpunk'', ''frontier''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend guild profile layout validation';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.update_character_profile_command(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_command(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_guild_profile_command(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
