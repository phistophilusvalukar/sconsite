/* Allow each profile shape to override the standard character portrait. */

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_portrait_image_url text;

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_portrait_image_url_check,
  ADD CONSTRAINT characters_profile_portrait_image_url_check CHECK (
    profile_portrait_image_url IS NULL
    OR (length(profile_portrait_image_url) <= 2000 AND profile_portrait_image_url ~ '^https://')
  );

CREATE OR REPLACE FUNCTION public.update_character_profile_v7_command(
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
  v_portrait_url text;
  v_updated boolean;
  v_row_count integer := 0;
BEGIN
  v_portrait_url := NULLIF(trim(COALESCE(p_profile->>'portraitImageUrl', '')), '');
  IF v_portrait_url IS NOT NULL AND (length(v_portrait_url) > 2000 OR v_portrait_url !~ '^https://') THEN
    RAISE EXCEPTION 'Use a direct HTTPS portrait image URL';
  END IF;

  v_updated := public.update_character_profile_v6_command(
    p_character_id,
    p_profile,
    p_change_shape_enabled,
    p_alternate_shape
  );

  IF v_updated THEN
    UPDATE public.characters
    SET profile_portrait_image_url = v_portrait_url,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
  END IF;

  RETURN v_updated AND v_row_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v7_command(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v7_command(uuid, jsonb, boolean, jsonb) TO authenticated;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_standard_portrait;

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
      '{character,profile_portrait_image_url}',
      COALESCE(to_jsonb(character.profile_portrait_image_url), 'null'::jsonb),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_standard_portrait(character.id) AS payload
  ) public_profile
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
