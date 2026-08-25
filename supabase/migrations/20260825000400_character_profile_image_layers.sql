/* Add owner-configurable image planes behind and above character profiles. */

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_atmosphere_image_url text,
  ADD COLUMN IF NOT EXISTS profile_atmosphere_position_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS profile_atmosphere_position_y integer NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS profile_atmosphere_size integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS profile_atmosphere_opacity integer NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS profile_atmosphere_parallax boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_foreground_image_url text,
  ADD COLUMN IF NOT EXISTS profile_foreground_position_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS profile_foreground_position_y integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS profile_foreground_size integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS profile_foreground_opacity integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS profile_foreground_parallax boolean NOT NULL DEFAULT false;

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_atmosphere_image_url_check,
  DROP CONSTRAINT IF EXISTS characters_profile_atmosphere_position_x_check,
  DROP CONSTRAINT IF EXISTS characters_profile_atmosphere_position_y_check,
  DROP CONSTRAINT IF EXISTS characters_profile_atmosphere_size_check,
  DROP CONSTRAINT IF EXISTS characters_profile_atmosphere_opacity_check,
  DROP CONSTRAINT IF EXISTS characters_profile_foreground_image_url_check,
  DROP CONSTRAINT IF EXISTS characters_profile_foreground_position_x_check,
  DROP CONSTRAINT IF EXISTS characters_profile_foreground_position_y_check,
  DROP CONSTRAINT IF EXISTS characters_profile_foreground_size_check,
  DROP CONSTRAINT IF EXISTS characters_profile_foreground_opacity_check,
  ADD CONSTRAINT characters_profile_atmosphere_image_url_check CHECK (
    profile_atmosphere_image_url IS NULL
    OR (length(profile_atmosphere_image_url) <= 2000 AND profile_atmosphere_image_url ~ '^https://')
  ),
  ADD CONSTRAINT characters_profile_atmosphere_position_x_check CHECK (profile_atmosphere_position_x BETWEEN 0 AND 100),
  ADD CONSTRAINT characters_profile_atmosphere_position_y_check CHECK (profile_atmosphere_position_y BETWEEN 0 AND 100),
  ADD CONSTRAINT characters_profile_atmosphere_size_check CHECK (profile_atmosphere_size BETWEEN 5 AND 200),
  ADD CONSTRAINT characters_profile_atmosphere_opacity_check CHECK (profile_atmosphere_opacity BETWEEN 0 AND 100),
  ADD CONSTRAINT characters_profile_foreground_image_url_check CHECK (
    profile_foreground_image_url IS NULL
    OR (length(profile_foreground_image_url) <= 2000 AND profile_foreground_image_url ~ '^https://')
  ),
  ADD CONSTRAINT characters_profile_foreground_position_x_check CHECK (profile_foreground_position_x BETWEEN 0 AND 100),
  ADD CONSTRAINT characters_profile_foreground_position_y_check CHECK (profile_foreground_position_y BETWEEN 0 AND 100),
  ADD CONSTRAINT characters_profile_foreground_size_check CHECK (profile_foreground_size BETWEEN 5 AND 200),
  ADD CONSTRAINT characters_profile_foreground_opacity_check CHECK (profile_foreground_opacity BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION public.update_character_profile_v11_command(
  p_character_id uuid,
  p_profile jsonb,
  p_change_shape_enabled boolean,
  p_alternate_shape jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated boolean;
  v_atmosphere_url text := NULLIF(trim(COALESCE(p_profile->>'atmosphereImageUrl', '')), '');
  v_atmosphere_x integer;
  v_atmosphere_y integer;
  v_atmosphere_size integer;
  v_atmosphere_opacity integer;
  v_atmosphere_parallax boolean;
  v_foreground_url text := NULLIF(trim(COALESCE(p_profile->>'foregroundImageUrl', '')), '');
  v_foreground_x integer;
  v_foreground_y integer;
  v_foreground_size integer;
  v_foreground_opacity integer;
  v_foreground_parallax boolean;
BEGIN
  IF v_atmosphere_url IS NOT NULL AND (length(v_atmosphere_url) > 2000 OR v_atmosphere_url !~ '^https://') THEN
    RAISE EXCEPTION 'Use a direct HTTPS atmosphere image URL';
  END IF;
  IF v_foreground_url IS NOT NULL AND (length(v_foreground_url) > 2000 OR v_foreground_url !~ '^https://') THEN
    RAISE EXCEPTION 'Use a direct HTTPS foreground image URL';
  END IF;

  IF jsonb_typeof(p_profile->'atmospherePositionX') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_profile->'atmospherePositionY') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_profile->'atmosphereSize') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_profile->'atmosphereOpacity') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_profile->'foregroundPositionX') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_profile->'foregroundPositionY') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_profile->'foregroundSize') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_profile->'foregroundOpacity') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Profile image layer placement values must be numbers';
  END IF;
  IF jsonb_typeof(p_profile->'atmosphereParallax') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_profile->'foregroundParallax') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Profile image layer parallax values must be booleans';
  END IF;

  v_atmosphere_x := (p_profile->>'atmospherePositionX')::integer;
  v_atmosphere_y := (p_profile->>'atmospherePositionY')::integer;
  v_atmosphere_size := (p_profile->>'atmosphereSize')::integer;
  v_atmosphere_opacity := (p_profile->>'atmosphereOpacity')::integer;
  v_atmosphere_parallax := (p_profile->>'atmosphereParallax')::boolean;
  v_foreground_x := (p_profile->>'foregroundPositionX')::integer;
  v_foreground_y := (p_profile->>'foregroundPositionY')::integer;
  v_foreground_size := (p_profile->>'foregroundSize')::integer;
  v_foreground_opacity := (p_profile->>'foregroundOpacity')::integer;
  v_foreground_parallax := (p_profile->>'foregroundParallax')::boolean;

  IF v_atmosphere_x NOT BETWEEN 0 AND 100 OR v_atmosphere_y NOT BETWEEN 0 AND 100
     OR v_foreground_x NOT BETWEEN 0 AND 100 OR v_foreground_y NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Profile image layer positions must be between 0 and 100';
  END IF;
  IF v_atmosphere_size NOT BETWEEN 5 AND 200 OR v_foreground_size NOT BETWEEN 5 AND 200 THEN
    RAISE EXCEPTION 'Profile image layer sizes must be between 5 and 200';
  END IF;
  IF v_atmosphere_opacity NOT BETWEEN 0 AND 100 OR v_foreground_opacity NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Profile image layer opacity must be between 0 and 100';
  END IF;

  v_updated := public.update_character_profile_v10_command(
    p_character_id,
    p_profile,
    p_change_shape_enabled,
    p_alternate_shape
  );

  IF v_updated THEN
    UPDATE public.characters
    SET profile_atmosphere_image_url = v_atmosphere_url,
        profile_atmosphere_position_x = v_atmosphere_x,
        profile_atmosphere_position_y = v_atmosphere_y,
        profile_atmosphere_size = v_atmosphere_size,
        profile_atmosphere_opacity = v_atmosphere_opacity,
        profile_atmosphere_parallax = v_atmosphere_parallax,
        profile_foreground_image_url = v_foreground_url,
        profile_foreground_position_x = v_foreground_x,
        profile_foreground_position_y = v_foreground_y,
        profile_foreground_size = v_foreground_size,
        profile_foreground_opacity = v_foreground_opacity,
        profile_foreground_parallax = v_foreground_parallax,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v11_command(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v11_command(uuid, jsonb, boolean, jsonb) TO authenticated;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_image_layers;

CREATE FUNCTION public.get_public_character_profile(p_character_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE
    WHEN public_profile.payload IS NULL THEN NULL
    ELSE jsonb_set(
      public_profile.payload,
      '{character}',
      (public_profile.payload->'character') || jsonb_build_object(
        'profile_atmosphere_image_url', character.profile_atmosphere_image_url,
        'profile_atmosphere_position_x', character.profile_atmosphere_position_x,
        'profile_atmosphere_position_y', character.profile_atmosphere_position_y,
        'profile_atmosphere_size', character.profile_atmosphere_size,
        'profile_atmosphere_opacity', character.profile_atmosphere_opacity,
        'profile_atmosphere_parallax', character.profile_atmosphere_parallax,
        'profile_foreground_image_url', character.profile_foreground_image_url,
        'profile_foreground_position_x', character.profile_foreground_position_x,
        'profile_foreground_position_y', character.profile_foreground_position_y,
        'profile_foreground_size', character.profile_foreground_size,
        'profile_foreground_opacity', character.profile_foreground_opacity,
        'profile_foreground_parallax', character.profile_foreground_parallax
      ),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_image_layers(character.id) AS payload
  ) public_profile
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
