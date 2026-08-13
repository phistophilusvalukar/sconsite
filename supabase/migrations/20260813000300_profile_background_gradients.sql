/*
  # Dual-color profile backgrounds

  Adds optional directional gradients to character and guild pages. A centered
  transition-rate value controls whether the colors meet sharply or blend
  across the full page. Existing pages remain on their solid base color.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS background_mode text NOT NULL DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS gradient_color text NOT NULL DEFAULT '#27302d',
  ADD COLUMN IF NOT EXISTS gradient_orientation text NOT NULL DEFAULT 'diagonal',
  ADD COLUMN IF NOT EXISTS gradient_transition_rate integer NOT NULL DEFAULT 100;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS profile_background_mode text NOT NULL DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS profile_gradient_color text NOT NULL DEFAULT '#27302d',
  ADD COLUMN IF NOT EXISTS profile_gradient_orientation text NOT NULL DEFAULT 'diagonal',
  ADD COLUMN IF NOT EXISTS profile_gradient_transition_rate integer NOT NULL DEFAULT 100;

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_background_mode_check,
  DROP CONSTRAINT IF EXISTS guilds_gradient_color_check,
  DROP CONSTRAINT IF EXISTS guilds_gradient_orientation_check,
  DROP CONSTRAINT IF EXISTS guilds_gradient_transition_rate_check,
  ADD CONSTRAINT guilds_background_mode_check CHECK (background_mode IN ('solid','gradient')),
  ADD CONSTRAINT guilds_gradient_color_check CHECK (gradient_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT guilds_gradient_orientation_check CHECK (gradient_orientation IN ('horizontal','diagonal','vertical')),
  ADD CONSTRAINT guilds_gradient_transition_rate_check CHECK (gradient_transition_rate BETWEEN 0 AND 100);

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_profile_background_mode_check,
  DROP CONSTRAINT IF EXISTS characters_profile_gradient_color_check,
  DROP CONSTRAINT IF EXISTS characters_profile_gradient_orientation_check,
  DROP CONSTRAINT IF EXISTS characters_profile_gradient_transition_rate_check,
  ADD CONSTRAINT characters_profile_background_mode_check CHECK (profile_background_mode IN ('solid','gradient')),
  ADD CONSTRAINT characters_profile_gradient_color_check CHECK (profile_gradient_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT characters_profile_gradient_orientation_check CHECK (profile_gradient_orientation IN ('horizontal','diagonal','vertical')),
  ADD CONSTRAINT characters_profile_gradient_transition_rate_check CHECK (profile_gradient_transition_rate BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION update_character_profile_v2_command(p_character_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text := COALESCE(p_profile->>'backgroundMode', 'solid');
  v_gradient_color text := COALESCE(p_profile->>'gradientColor', '#27302d');
  v_orientation text := COALESCE(p_profile->>'gradientOrientation', 'diagonal');
  v_transition_rate integer;
  v_updated boolean;
BEGIN
  BEGIN
    v_transition_rate := COALESCE((p_profile->>'gradientTransitionRate')::integer, 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Invalid gradient transition rate';
  END;

  IF v_mode NOT IN ('solid','gradient')
     OR v_gradient_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_orientation NOT IN ('horizontal','diagonal','vertical')
     OR v_transition_rate NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Invalid character background gradient';
  END IF;

  v_updated := update_character_profile_command(p_character_id, p_profile);
  IF v_updated THEN
    UPDATE characters
    SET profile_background_mode = v_mode,
        profile_gradient_color = v_gradient_color,
        profile_gradient_orientation = v_orientation,
        profile_gradient_transition_rate = v_transition_rate,
        updated_at = now()
    WHERE id = p_character_id AND user_id = auth.uid()::text;
  END IF;
  RETURN v_updated AND FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION update_guild_profile_v4_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text := COALESCE(p_profile->>'backgroundMode', 'solid');
  v_gradient_color text := COALESCE(p_profile->>'gradientColor', '#27302d');
  v_orientation text := COALESCE(p_profile->>'gradientOrientation', 'diagonal');
  v_transition_rate integer;
  v_updated boolean;
BEGIN
  BEGIN
    v_transition_rate := COALESCE((p_profile->>'gradientTransitionRate')::integer, 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Invalid gradient transition rate';
  END;

  IF v_mode NOT IN ('solid','gradient')
     OR v_gradient_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_orientation NOT IN ('horizontal','diagonal','vertical')
     OR v_transition_rate NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Invalid guild background gradient';
  END IF;

  v_updated := update_guild_profile_v3_command(p_guild_id, p_profile);
  IF v_updated THEN
    UPDATE guilds
    SET background_mode = v_mode,
        gradient_color = v_gradient_color,
        gradient_orientation = v_orientation,
        gradient_transition_rate = v_transition_rate,
        updated_at = now()
    WHERE id = p_guild_id;
  END IF;
  RETURN v_updated AND FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_character_profile_command(uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION update_guild_profile_v3_command(uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION update_character_profile_v2_command(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_guild_profile_v4_command(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_v2_command(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_guild_profile_v4_command(uuid,jsonb) TO authenticated;
