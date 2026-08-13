/*
  # Guild roster Class Photo

  Stores a purely presentational arrangement of transparent character cutouts.
  Canonical guild membership remains in guild_memberships; this JSON contains
  only placement information for active, eligible members.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS roster_lineup jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_roster_display_check,
  DROP CONSTRAINT IF EXISTS guilds_roster_lineup_check,
  ADD CONSTRAINT guilds_roster_display_check CHECK (roster_display IN ('ledger', 'dossiers', 'cards', 'lineup')),
  ADD CONSTRAINT guilds_roster_lineup_check CHECK (jsonb_typeof(roster_lineup) = 'array');

CREATE OR REPLACE FUNCTION update_guild_profile_v5_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_display text := COALESCE(p_profile->>'rosterDisplay', 'ledger');
  v_lineup jsonb := COALESCE(p_profile->'rosterLineup', '[]'::jsonb);
  v_legacy_profile jsonb := p_profile;
  v_clean_lineup jsonb := '[]'::jsonb;
  v_item jsonb;
  v_character_id uuid;
  v_x integer;
  v_y integer;
  v_scale integer;
  v_rotation integer;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_updated boolean;
BEGIN
  IF v_requested_display NOT IN ('ledger', 'dossiers', 'cards', 'lineup') THEN
    RAISE EXCEPTION 'Invalid guild roster presentation';
  END IF;
  IF jsonb_typeof(v_lineup) <> 'array' OR jsonb_array_length(v_lineup) > 30 THEN
    RAISE EXCEPTION 'Invalid guild Class Photo';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_lineup)
  LOOP
    BEGIN
      v_character_id := (v_item->>'characterId')::uuid;
      v_x := (v_item->>'x')::integer;
      v_y := (v_item->>'y')::integer;
      v_scale := (v_item->>'scale')::integer;
      v_rotation := (v_item->>'rotation')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation THEN
      RAISE EXCEPTION 'Invalid guild Class Photo placement';
    END;

    IF v_character_id IS NULL
       OR v_x NOT BETWEEN 0 AND 100
       OR v_y NOT BETWEEN -30 AND 40
       OR v_scale NOT BETWEEN 50 AND 180
       OR v_rotation NOT BETWEEN -12 AND 12
       OR v_character_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Invalid guild Class Photo placement';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM guild_memberships membership
      JOIN characters character ON character.id = membership.character_id
      WHERE membership.guild_id = p_guild_id
        AND membership.character_id = v_character_id
        AND membership.membership_status = 'Active'
        AND character.profile_dynamic_portrait_enabled = true
        AND NULLIF(BTRIM(character.profile_portrait_cutout_url), '') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Class Photo characters must be active guild members with Dynamic Portrait cutouts';
    END IF;

    v_seen := array_append(v_seen, v_character_id);
    v_clean_lineup := v_clean_lineup || jsonb_build_array(jsonb_build_object(
      'characterId', v_character_id,
      'x', v_x,
      'y', v_y,
      'scale', v_scale,
      'rotation', v_rotation
    ));
  END LOOP;

  -- The previous command knows only the original three roster styles. Let it
  -- perform all existing validation and authorization, then store the new
  -- presentation and its cosmetic arrangement here.
  IF v_requested_display = 'lineup' THEN
    v_legacy_profile := jsonb_set(v_legacy_profile, '{rosterDisplay}', '"cards"'::jsonb, true);
  END IF;
  v_updated := update_guild_profile_v4_command(p_guild_id, v_legacy_profile);

  IF v_updated THEN
    UPDATE guilds
    SET roster_display = v_requested_display,
        roster_lineup = v_clean_lineup,
        updated_at = now()
    WHERE id = p_guild_id;
  END IF;

  RETURN v_updated AND FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_guild_profile_v4_command(uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION update_guild_profile_v5_command(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_profile_v5_command(uuid,jsonb) TO authenticated;
