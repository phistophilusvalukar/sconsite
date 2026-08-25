/* Let Splash profiles show only the Dynamic Portrait character cutout. */

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_splash_hide_portrait_background boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.update_character_profile_v10_command(
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
  v_hide_background boolean;
BEGIN
  IF jsonb_typeof(p_profile->'splashHideDynamicPortraitBackground') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Splash portrait background visibility must be a boolean';
  END IF;
  v_hide_background := (p_profile->>'splashHideDynamicPortraitBackground')::boolean;

  v_updated := public.update_character_profile_v9_command(
    p_character_id,
    p_profile,
    p_change_shape_enabled,
    p_alternate_shape
  );

  IF v_updated THEN
    UPDATE public.characters
    SET profile_splash_hide_portrait_background = v_hide_background,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v10_command(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v10_command(uuid, jsonb, boolean, jsonb) TO authenticated;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_splash_portrait_background;

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
      '{character,profile_splash_hide_portrait_background}',
      to_jsonb(character.profile_splash_hide_portrait_background),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_splash_portrait_background(character.id) AS payload
  ) public_profile
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
