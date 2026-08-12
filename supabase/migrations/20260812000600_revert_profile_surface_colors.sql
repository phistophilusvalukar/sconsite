/*
  # Revert customizable profile surfaces

  Restores the three-color guild and character profile commands while keeping
  the applied 20260812000500 migration in immutable migration history.
*/

DROP FUNCTION IF EXISTS update_guild_profile_command(uuid, jsonb);

ALTER FUNCTION update_guild_profile_command_without_surface(uuid, jsonb)
  RENAME TO update_guild_profile_command;

REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS update_character_profile_command(uuid, jsonb);

ALTER FUNCTION update_character_profile_command_without_surface(uuid, jsonb)
  RENAME TO update_character_profile_command;

REVOKE ALL ON FUNCTION update_character_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_command(uuid, jsonb) TO authenticated;

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_surface_color_check,
  DROP COLUMN IF EXISTS surface_color;

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_profile_surface_color_check,
  DROP COLUMN IF EXISTS profile_surface_color;
