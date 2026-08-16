/* Store an optional second presentation for characters with alternate forms. */

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_change_shape_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_alternate_shape jsonb;

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_alternate_shape_check,
  ADD CONSTRAINT characters_profile_alternate_shape_check CHECK (
    profile_alternate_shape IS NULL OR jsonb_typeof(profile_alternate_shape) = 'object'
  );

CREATE OR REPLACE FUNCTION public.update_character_profile_v6_command(
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
  v_row_count integer := 0;
BEGIN
  IF p_change_shape_enabled AND (
    p_alternate_shape IS NULL
    OR jsonb_typeof(p_alternate_shape) <> 'object'
    OR length(p_alternate_shape::text) > 50000
  ) THEN
    RAISE EXCEPTION 'A valid alternate shape profile is required';
  END IF;

  v_updated := public.update_character_profile_v5_command(p_character_id, p_profile);
  IF v_updated THEN
    UPDATE public.characters
    SET profile_change_shape_enabled = p_change_shape_enabled,
        profile_alternate_shape = CASE WHEN p_change_shape_enabled THEN p_alternate_shape ELSE NULL END,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
  END IF;

  RETURN v_updated AND v_row_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v6_command(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v6_command(uuid, jsonb, boolean, jsonb) TO authenticated;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_change_shape;

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
      jsonb_set(
        public_profile.payload,
        '{character,profile_change_shape_enabled}',
        to_jsonb(character.profile_change_shape_enabled),
        true
      ),
      '{character,profile_alternate_shape}',
      COALESCE(character.profile_alternate_shape, 'null'::jsonb),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_change_shape(character.id) AS payload
  ) public_profile
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
