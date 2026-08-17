/* Replace Frontier with Nostalgia and add a reusable pixel font. */

ALTER TABLE public.characters DROP CONSTRAINT IF EXISTS characters_profile_layout_style_check;
ALTER TABLE public.guilds DROP CONSTRAINT IF EXISTS guilds_layout_style_check;

UPDATE public.characters SET profile_layout_style = 'nostalgia' WHERE profile_layout_style = 'frontier';
UPDATE public.guilds SET layout_style = 'nostalgia' WHERE layout_style = 'frontier';

ALTER TABLE public.characters
  ADD CONSTRAINT characters_profile_layout_style_check CHECK (
    profile_layout_style IN ('chronicle', 'dossier', 'spotlight', 'saga', 'cyberpunk', 'nostalgia')
  ),
  DROP CONSTRAINT IF EXISTS characters_profile_font_family_check,
  DROP CONSTRAINT IF EXISTS characters_profile_title_font_family_check,
  DROP CONSTRAINT IF EXISTS characters_profile_subtitle_font_family_check,
  ADD CONSTRAINT characters_profile_font_family_check CHECK (profile_font_family IN (
    'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
    'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
    'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p'
  )),
  ADD CONSTRAINT characters_profile_title_font_family_check CHECK (profile_title_font_family IN (
    'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
    'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
    'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p'
  )),
  ADD CONSTRAINT characters_profile_subtitle_font_family_check CHECK (profile_subtitle_font_family IN (
    'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
    'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
    'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p'
  ));

ALTER TABLE public.guilds
  ADD CONSTRAINT guilds_layout_style_check CHECK (
    layout_style IN ('chronicle', 'stronghold', 'banner', 'saga', 'cyberpunk', 'nostalgia')
  ),
  DROP CONSTRAINT IF EXISTS guilds_font_family_check,
  DROP CONSTRAINT IF EXISTS guilds_title_font_family_check,
  DROP CONSTRAINT IF EXISTS guilds_subtitle_font_family_check,
  ADD CONSTRAINT guilds_font_family_check CHECK (font_family IN (
    'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
    'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
    'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p'
  )),
  ADD CONSTRAINT guilds_title_font_family_check CHECK (title_font_family IN (
    'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
    'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
    'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p'
  )),
  ADD CONSTRAINT guilds_subtitle_font_family_check CHECK (subtitle_font_family IN (
    'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
    'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
    'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p'
  ));

DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.update_character_profile_command(uuid,jsonb)'::regprocedure) INTO v_definition;
  v_definition := replace(v_definition, '''cyberpunk'', ''frontier''', '''cyberpunk'', ''nostalgia''');
  v_definition := replace(v_definition, '''mystery-quest''', '''mystery-quest'', ''press-start-2p''');
  IF position('''nostalgia''' IN v_definition) = 0 OR position('''press-start-2p''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend character profile options';
  END IF;
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.update_guild_profile_command(uuid,jsonb)'::regprocedure) INTO v_definition;
  v_definition := replace(v_definition, '''cyberpunk'', ''frontier''', '''cyberpunk'', ''nostalgia''');
  v_definition := replace(v_definition, '''mystery-quest''', '''mystery-quest'', ''press-start-2p''');
  IF position('''nostalgia''' IN v_definition) = 0 OR position('''press-start-2p''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend guild profile options';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.update_character_profile_command(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_command(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_guild_profile_command(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
