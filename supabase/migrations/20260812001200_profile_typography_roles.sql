/*
  # Independent profile typography roles

  Guild and character pages persist separate font families and sizes for the
  main title, subtitles/section headings, and normal text. Protected profile
  commands remain the only write path for these settings.
*/

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS profile_title_font_family text NOT NULL DEFAULT 'cinzel',
  ADD COLUMN IF NOT EXISTS profile_subtitle_font_family text NOT NULL DEFAULT 'cinzel',
  ADD COLUMN IF NOT EXISTS profile_title_font_size integer NOT NULL DEFAULT 124,
  ADD COLUMN IF NOT EXISTS profile_subtitle_font_size integer NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS profile_text_font_size integer NOT NULL DEFAULT 16;

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS title_font_family text NOT NULL DEFAULT 'cinzel',
  ADD COLUMN IF NOT EXISTS subtitle_font_family text NOT NULL DEFAULT 'cinzel',
  ADD COLUMN IF NOT EXISTS title_font_size integer NOT NULL DEFAULT 96,
  ADD COLUMN IF NOT EXISTS subtitle_font_size integer NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS text_font_size integer NOT NULL DEFAULT 16;

-- Preserve the appearance of pages customized before typography roles existed.
UPDATE characters
SET profile_title_font_family = profile_font_family,
    profile_subtitle_font_family = profile_font_family;

UPDATE guilds
SET title_font_family = font_family,
    subtitle_font_family = font_family;

ALTER TABLE characters
  ALTER COLUMN profile_font_family SET DEFAULT 'inter',
  DROP CONSTRAINT IF EXISTS characters_profile_title_font_family_check,
  DROP CONSTRAINT IF EXISTS characters_profile_subtitle_font_family_check,
  DROP CONSTRAINT IF EXISTS characters_profile_title_font_size_check,
  DROP CONSTRAINT IF EXISTS characters_profile_subtitle_font_size_check,
  DROP CONSTRAINT IF EXISTS characters_profile_text_font_size_check,
  ADD CONSTRAINT characters_profile_title_font_family_check CHECK (
    profile_title_font_family IN (
      'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
      'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
      'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest'
    )
  ),
  ADD CONSTRAINT characters_profile_subtitle_font_family_check CHECK (
    profile_subtitle_font_family IN (
      'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
      'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
      'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest'
    )
  ),
  ADD CONSTRAINT characters_profile_title_font_size_check CHECK (profile_title_font_size BETWEEN 40 AND 180),
  ADD CONSTRAINT characters_profile_subtitle_font_size_check CHECK (profile_subtitle_font_size BETWEEN 14 AND 56),
  ADD CONSTRAINT characters_profile_text_font_size_check CHECK (profile_text_font_size BETWEEN 12 AND 26);

ALTER TABLE guilds
  ALTER COLUMN font_family SET DEFAULT 'inter',
  DROP CONSTRAINT IF EXISTS guilds_title_font_family_check,
  DROP CONSTRAINT IF EXISTS guilds_subtitle_font_family_check,
  DROP CONSTRAINT IF EXISTS guilds_title_font_size_check,
  DROP CONSTRAINT IF EXISTS guilds_subtitle_font_size_check,
  DROP CONSTRAINT IF EXISTS guilds_text_font_size_check,
  ADD CONSTRAINT guilds_title_font_family_check CHECK (
    title_font_family IN (
      'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
      'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
      'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest'
    )
  ),
  ADD CONSTRAINT guilds_subtitle_font_family_check CHECK (
    subtitle_font_family IN (
      'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
      'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
      'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest'
    )
  ),
  ADD CONSTRAINT guilds_title_font_size_check CHECK (title_font_size BETWEEN 40 AND 180),
  ADD CONSTRAINT guilds_subtitle_font_size_check CHECK (subtitle_font_size BETWEEN 14 AND 56),
  ADD CONSTRAINT guilds_text_font_size_check CHECK (text_font_size BETWEEN 12 AND 26);

DO $migration$
DECLARE
  v_definition text;
  v_font_list text := '''cinzel'', ''cormorant'', ''merriweather'', ''inter'', ''alegreya'', ''im-fell'', ''uncial'', ''pirata'', ''grenze'', ''caesar'', ''metal-mania'', ''new-rocker'', ''trade-winds'', ''great-vibes'', ''marcellus'', ''cinzel-decorative'', ''tangerine'', ''almendra-display'', ''henny-penny'', ''macondo'', ''mystery-quest''';
BEGIN
  SELECT pg_get_functiondef('update_character_profile_command(uuid,jsonb)'::regprocedure)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    '  v_font text := COALESCE(p_profile->>''fontFamily'', ''cinzel'');',
    '  v_font text := COALESCE(p_profile->>''fontFamily'', ''inter'');' || E'\n' ||
    '  v_title_font text := COALESCE(p_profile->>''titleFontFamily'', v_font);' || E'\n' ||
    '  v_subtitle_font text := COALESCE(p_profile->>''subtitleFontFamily'', v_font);' || E'\n' ||
    '  v_title_font_size integer := COALESCE((p_profile->>''titleFontSize'')::integer, 124);' || E'\n' ||
    '  v_subtitle_font_size integer := COALESCE((p_profile->>''subtitleFontSize'')::integer, 22);' || E'\n' ||
    '  v_text_font_size integer := COALESCE((p_profile->>''textFontSize'')::integer, 16);'
  );

  v_definition := replace(
    v_definition,
    '  IF v_font NOT IN (',
    '  IF v_title_font NOT IN (' || v_font_list || ') OR v_subtitle_font NOT IN (' || v_font_list || E') THEN\n' ||
    '    RAISE EXCEPTION ''Invalid character typography font'';' || E'\n' ||
    '  END IF;' || E'\n' ||
    '  IF v_title_font_size NOT BETWEEN 40 AND 180' || E'\n' ||
    '     OR v_subtitle_font_size NOT BETWEEN 14 AND 56' || E'\n' ||
    '     OR v_text_font_size NOT BETWEEN 12 AND 26 THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Invalid character typography size'';' || E'\n' ||
    '  END IF;' || E'\n' ||
    '  IF v_font NOT IN ('
  );

  v_definition := replace(
    v_definition,
    '      profile_font_family = v_font,',
    '      profile_font_family = v_font,' || E'\n' ||
    '      profile_title_font_family = v_title_font,' || E'\n' ||
    '      profile_subtitle_font_family = v_subtitle_font,' || E'\n' ||
    '      profile_title_font_size = v_title_font_size,' || E'\n' ||
    '      profile_subtitle_font_size = v_subtitle_font_size,' || E'\n' ||
    '      profile_text_font_size = v_text_font_size,'
  );

  IF position('profile_title_font_family = v_title_font' IN v_definition) = 0
     OR position('v_title_font_size NOT BETWEEN 40 AND 180' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend the character profile command with typography roles';
  END IF;
  EXECUTE v_definition;

  SELECT pg_get_functiondef('update_guild_profile_command(uuid,jsonb)'::regprocedure)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    '  v_font text := COALESCE(p_profile->>''fontFamily'', ''cinzel'');',
    '  v_font text := COALESCE(p_profile->>''fontFamily'', ''inter'');' || E'\n' ||
    '  v_title_font text := COALESCE(p_profile->>''titleFontFamily'', v_font);' || E'\n' ||
    '  v_subtitle_font text := COALESCE(p_profile->>''subtitleFontFamily'', v_font);' || E'\n' ||
    '  v_title_font_size integer := COALESCE((p_profile->>''titleFontSize'')::integer, 96);' || E'\n' ||
    '  v_subtitle_font_size integer := COALESCE((p_profile->>''subtitleFontSize'')::integer, 21);' || E'\n' ||
    '  v_text_font_size integer := COALESCE((p_profile->>''textFontSize'')::integer, 16);'
  );

  v_definition := replace(
    v_definition,
    '  IF v_font NOT IN (',
    '  IF v_title_font NOT IN (' || v_font_list || ') OR v_subtitle_font NOT IN (' || v_font_list || E') THEN\n' ||
    '    RAISE EXCEPTION ''Invalid guild typography font'';' || E'\n' ||
    '  END IF;' || E'\n' ||
    '  IF v_title_font_size NOT BETWEEN 40 AND 180' || E'\n' ||
    '     OR v_subtitle_font_size NOT BETWEEN 14 AND 56' || E'\n' ||
    '     OR v_text_font_size NOT BETWEEN 12 AND 26 THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Invalid guild typography size'';' || E'\n' ||
    '  END IF;' || E'\n' ||
    '  IF v_font NOT IN ('
  );

  v_definition := replace(
    v_definition,
    '      font_family = v_font,',
    '      font_family = v_font,' || E'\n' ||
    '      title_font_family = v_title_font,' || E'\n' ||
    '      subtitle_font_family = v_subtitle_font,' || E'\n' ||
    '      title_font_size = v_title_font_size,' || E'\n' ||
    '      subtitle_font_size = v_subtitle_font_size,' || E'\n' ||
    '      text_font_size = v_text_font_size,'
  );

  IF position('title_font_family = v_title_font' IN v_definition) = 0
     OR position('v_title_font_size NOT BETWEEN 40 AND 180' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend the guild profile command with typography roles';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION update_character_profile_command(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_command(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;
