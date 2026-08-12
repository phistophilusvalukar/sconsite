/*
  # Readable customizable profile surfaces

  Historical migration retained because it has already been applied remotely.
  Its changes are reverted by 20260812000600_revert_profile_surface_colors.sql.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS surface_color text NOT NULL DEFAULT '#1d2321';

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS profile_surface_color text NOT NULL DEFAULT '#1d2321';

ALTER TABLE guilds
  ALTER COLUMN font_color SET DEFAULT '#f0ede7',
  ALTER COLUMN base_color SET DEFAULT '#111615',
  ALTER COLUMN accent_color SET DEFAULT '#a09482';

ALTER TABLE characters
  ALTER COLUMN profile_font_color SET DEFAULT '#f0ede7',
  ALTER COLUMN profile_base_color SET DEFAULT '#111615',
  ALTER COLUMN profile_accent_color SET DEFAULT '#a09482';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guilds_surface_color_check') THEN
    ALTER TABLE guilds ADD CONSTRAINT guilds_surface_color_check
      CHECK (surface_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_profile_surface_color_check') THEN
    ALTER TABLE characters ADD CONSTRAINT characters_profile_surface_color_check
      CHECK (profile_surface_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

ALTER FUNCTION update_guild_profile_command(uuid, jsonb)
  RENAME TO update_guild_profile_command_without_surface;

REVOKE ALL ON FUNCTION update_guild_profile_command_without_surface(uuid, jsonb) FROM PUBLIC, authenticated;

CREATE FUNCTION update_guild_profile_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_surface_color text := COALESCE(p_profile->>'surfaceColor', '#1d2321');
  v_updated boolean;
BEGIN
  IF v_surface_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid guild surface color';
  END IF;

  v_updated := update_guild_profile_command_without_surface(p_guild_id, p_profile);
  IF v_updated THEN
    UPDATE guilds
    SET surface_color = v_surface_color
    WHERE id = p_guild_id;
  END IF;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;

ALTER FUNCTION update_character_profile_command(uuid, jsonb)
  RENAME TO update_character_profile_command_without_surface;

REVOKE ALL ON FUNCTION update_character_profile_command_without_surface(uuid, jsonb) FROM PUBLIC, authenticated;

CREATE FUNCTION update_character_profile_command(p_character_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_surface_color text := COALESCE(p_profile->>'surfaceColor', '#1d2321');
  v_updated boolean;
BEGIN
  IF v_surface_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid character surface color';
  END IF;

  v_updated := update_character_profile_command_without_surface(p_character_id, p_profile);
  IF v_updated THEN
    UPDATE characters
    SET profile_surface_color = v_surface_color
    WHERE id = p_character_id;
  END IF;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION update_character_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_command(uuid, jsonb) TO authenticated;
