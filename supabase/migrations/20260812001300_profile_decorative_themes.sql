/*
  # Fantasy profile borders and backgrounds

  Character owners and guildmasters can independently select a decorative
  border and background motif. Each treatment follows either the profile base
  color or accent/button color. Protected profile commands remain authoritative.
*/

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS profile_border_theme text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS profile_background_theme text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS profile_border_color_source text NOT NULL DEFAULT 'accent',
  ADD COLUMN IF NOT EXISTS profile_background_color_source text NOT NULL DEFAULT 'base';

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS border_theme text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS background_theme text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS border_color_source text NOT NULL DEFAULT 'accent',
  ADD COLUMN IF NOT EXISTS background_color_source text NOT NULL DEFAULT 'base';

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_profile_border_theme_check,
  DROP CONSTRAINT IF EXISTS characters_profile_background_theme_check,
  DROP CONSTRAINT IF EXISTS characters_profile_border_color_source_check,
  DROP CONSTRAINT IF EXISTS characters_profile_background_color_source_check,
  ADD CONSTRAINT characters_profile_border_theme_check CHECK (profile_border_theme IN (
    'none', 'fire', 'ice', 'earth', 'water', 'wood', 'metal', 'air', 'electricity', 'void', 'vitality',
    'alchemy', 'knights', 'dragons', 'pirates', 'cats', 'skulls', 'arcane', 'runes',
    'axes', 'swords', 'flintlocks', 'daggers'
  )),
  ADD CONSTRAINT characters_profile_background_theme_check CHECK (profile_background_theme IN (
    'none', 'fire', 'ice', 'earth', 'water', 'wood', 'metal', 'air', 'electricity', 'void', 'vitality',
    'alchemy', 'knights', 'dragons', 'pirates', 'cats', 'skulls', 'arcane', 'runes',
    'axes', 'swords', 'flintlocks', 'daggers'
  )),
  ADD CONSTRAINT characters_profile_border_color_source_check CHECK (profile_border_color_source IN ('base', 'accent')),
  ADD CONSTRAINT characters_profile_background_color_source_check CHECK (profile_background_color_source IN ('base', 'accent'));

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_border_theme_check,
  DROP CONSTRAINT IF EXISTS guilds_background_theme_check,
  DROP CONSTRAINT IF EXISTS guilds_border_color_source_check,
  DROP CONSTRAINT IF EXISTS guilds_background_color_source_check,
  ADD CONSTRAINT guilds_border_theme_check CHECK (border_theme IN (
    'none', 'fire', 'ice', 'earth', 'water', 'wood', 'metal', 'air', 'electricity', 'void', 'vitality',
    'alchemy', 'knights', 'dragons', 'pirates', 'cats', 'skulls', 'arcane', 'runes',
    'axes', 'swords', 'flintlocks', 'daggers'
  )),
  ADD CONSTRAINT guilds_background_theme_check CHECK (background_theme IN (
    'none', 'fire', 'ice', 'earth', 'water', 'wood', 'metal', 'air', 'electricity', 'void', 'vitality',
    'alchemy', 'knights', 'dragons', 'pirates', 'cats', 'skulls', 'arcane', 'runes',
    'axes', 'swords', 'flintlocks', 'daggers'
  )),
  ADD CONSTRAINT guilds_border_color_source_check CHECK (border_color_source IN ('base', 'accent')),
  ADD CONSTRAINT guilds_background_color_source_check CHECK (background_color_source IN ('base', 'accent'));

DO $migration$
DECLARE
  v_definition text;
  v_theme_validation text := '''none'', ''fire'', ''ice'', ''earth'', ''water'', ''wood'', ''metal'', ''air'', ''electricity'', ''void'', ''vitality'', ''alchemy'', ''knights'', ''dragons'', ''pirates'', ''cats'', ''skulls'', ''arcane'', ''runes'', ''axes'', ''swords'', ''flintlocks'', ''daggers''';
BEGIN
  SELECT pg_get_functiondef('update_character_profile_command(uuid,jsonb)'::regprocedure)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    '  v_layout text := COALESCE(p_profile->>''layoutStyle'', ''chronicle'');',
    '  v_layout text := COALESCE(p_profile->>''layoutStyle'', ''chronicle'');' || E'\n' ||
    '  v_border_theme text := COALESCE(p_profile->>''borderTheme'', ''none'');' || E'\n' ||
    '  v_background_theme text := COALESCE(p_profile->>''backgroundTheme'', ''none'');' || E'\n' ||
    '  v_border_color_source text := COALESCE(p_profile->>''borderColorSource'', ''accent'');' || E'\n' ||
    '  v_background_color_source text := COALESCE(p_profile->>''backgroundColorSource'', ''base'');'
  );

  v_definition := replace(
    v_definition,
    '  IF v_font_color !~',
    '  IF v_border_theme NOT IN (' || v_theme_validation || ')' || E'\n' ||
    '     OR v_background_theme NOT IN (' || v_theme_validation || ')' || E'\n' ||
    '     OR v_border_color_source NOT IN (''base'', ''accent'')' || E'\n' ||
    '     OR v_background_color_source NOT IN (''base'', ''accent'') THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Invalid character decoration option'';' || E'\n' ||
    '  END IF;' || E'\n' ||
    '  IF v_font_color !~'
  );

  v_definition := replace(
    v_definition,
    '      profile_accent_color = v_accent_color,',
    '      profile_accent_color = v_accent_color,' || E'\n' ||
    '      profile_border_theme = v_border_theme,' || E'\n' ||
    '      profile_background_theme = v_background_theme,' || E'\n' ||
    '      profile_border_color_source = v_border_color_source,' || E'\n' ||
    '      profile_background_color_source = v_background_color_source,'
  );

  IF position('profile_border_theme = v_border_theme' IN v_definition) = 0
     OR position('Invalid character decoration option' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend the character profile command with decoration settings';
  END IF;
  EXECUTE v_definition;

  SELECT pg_get_functiondef('update_guild_profile_command(uuid,jsonb)'::regprocedure)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    '  v_layout text := COALESCE(p_profile->>''layoutStyle'', ''chronicle'');',
    '  v_layout text := COALESCE(p_profile->>''layoutStyle'', ''chronicle'');' || E'\n' ||
    '  v_border_theme text := COALESCE(p_profile->>''borderTheme'', ''none'');' || E'\n' ||
    '  v_background_theme text := COALESCE(p_profile->>''backgroundTheme'', ''none'');' || E'\n' ||
    '  v_border_color_source text := COALESCE(p_profile->>''borderColorSource'', ''accent'');' || E'\n' ||
    '  v_background_color_source text := COALESCE(p_profile->>''backgroundColorSource'', ''base'');'
  );

  v_definition := replace(
    v_definition,
    '  IF v_font_color !~',
    '  IF v_border_theme NOT IN (' || v_theme_validation || ')' || E'\n' ||
    '     OR v_background_theme NOT IN (' || v_theme_validation || ')' || E'\n' ||
    '     OR v_border_color_source NOT IN (''base'', ''accent'')' || E'\n' ||
    '     OR v_background_color_source NOT IN (''base'', ''accent'') THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Invalid guild decoration option'';' || E'\n' ||
    '  END IF;' || E'\n' ||
    '  IF v_font_color !~'
  );

  v_definition := replace(
    v_definition,
    '      accent_color = v_accent_color,',
    '      accent_color = v_accent_color,' || E'\n' ||
    '      border_theme = v_border_theme,' || E'\n' ||
    '      background_theme = v_background_theme,' || E'\n' ||
    '      border_color_source = v_border_color_source,' || E'\n' ||
    '      background_color_source = v_background_color_source,'
  );

  IF position('border_theme = v_border_theme' IN v_definition) = 0
     OR position('Invalid guild decoration option' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend the guild profile command with decoration settings';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION update_character_profile_command(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_command(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;
