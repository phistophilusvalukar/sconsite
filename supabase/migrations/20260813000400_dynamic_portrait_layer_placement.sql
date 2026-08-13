/*
  # Dynamic Portrait layer placement

  Stores independent size and alignment controls for the background and
  transparent character layers. Existing portraits retain their current
  placement through neutral defaults.
*/

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS profile_portrait_background_scale integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS profile_portrait_background_position_x integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_portrait_background_position_y integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_portrait_cutout_scale integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS profile_portrait_cutout_position_x integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_portrait_cutout_position_y integer NOT NULL DEFAULT 0;

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_profile_portrait_background_scale_check,
  DROP CONSTRAINT IF EXISTS characters_profile_portrait_background_position_x_check,
  DROP CONSTRAINT IF EXISTS characters_profile_portrait_background_position_y_check,
  DROP CONSTRAINT IF EXISTS characters_profile_portrait_cutout_scale_check,
  DROP CONSTRAINT IF EXISTS characters_profile_portrait_cutout_position_x_check,
  DROP CONSTRAINT IF EXISTS characters_profile_portrait_cutout_position_y_check,
  ADD CONSTRAINT characters_profile_portrait_background_scale_check CHECK (profile_portrait_background_scale BETWEEN 50 AND 250),
  ADD CONSTRAINT characters_profile_portrait_background_position_x_check CHECK (profile_portrait_background_position_x BETWEEN -50 AND 50),
  ADD CONSTRAINT characters_profile_portrait_background_position_y_check CHECK (profile_portrait_background_position_y BETWEEN -50 AND 50),
  ADD CONSTRAINT characters_profile_portrait_cutout_scale_check CHECK (profile_portrait_cutout_scale BETWEEN 50 AND 250),
  ADD CONSTRAINT characters_profile_portrait_cutout_position_x_check CHECK (profile_portrait_cutout_position_x BETWEEN -50 AND 50),
  ADD CONSTRAINT characters_profile_portrait_cutout_position_y_check CHECK (profile_portrait_cutout_position_y BETWEEN -50 AND 50);

CREATE OR REPLACE FUNCTION update_character_profile_v3_command(p_character_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_background_scale integer;
  v_background_x integer;
  v_background_y integer;
  v_cutout_scale integer;
  v_cutout_x integer;
  v_cutout_y integer;
  v_updated boolean;
BEGIN
  BEGIN
    v_background_scale := COALESCE((p_profile->>'portraitBackgroundScale')::integer, 100);
    v_background_x := COALESCE((p_profile->>'portraitBackgroundPositionX')::integer, 0);
    v_background_y := COALESCE((p_profile->>'portraitBackgroundPositionY')::integer, 0);
    v_cutout_scale := COALESCE((p_profile->>'portraitCutoutScale')::integer, 100);
    v_cutout_x := COALESCE((p_profile->>'portraitCutoutPositionX')::integer, 0);
    v_cutout_y := COALESCE((p_profile->>'portraitCutoutPositionY')::integer, 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Invalid Dynamic Portrait layer placement';
  END;

  IF v_background_scale NOT BETWEEN 50 AND 250
     OR v_background_x NOT BETWEEN -50 AND 50
     OR v_background_y NOT BETWEEN -50 AND 50
     OR v_cutout_scale NOT BETWEEN 50 AND 250
     OR v_cutout_x NOT BETWEEN -50 AND 50
     OR v_cutout_y NOT BETWEEN -50 AND 50 THEN
    RAISE EXCEPTION 'Invalid Dynamic Portrait layer placement';
  END IF;

  v_updated := update_character_profile_v2_command(p_character_id, p_profile);
  IF v_updated THEN
    UPDATE characters
    SET profile_portrait_background_scale = v_background_scale,
        profile_portrait_background_position_x = v_background_x,
        profile_portrait_background_position_y = v_background_y,
        profile_portrait_cutout_scale = v_cutout_scale,
        profile_portrait_cutout_position_x = v_cutout_x,
        profile_portrait_cutout_position_y = v_cutout_y,
        updated_at = now()
    WHERE id = p_character_id AND user_id = auth.uid()::text;
  END IF;

  RETURN v_updated AND FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_character_profile_v2_command(uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION update_character_profile_v3_command(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_v3_command(uuid,jsonb) TO authenticated;
