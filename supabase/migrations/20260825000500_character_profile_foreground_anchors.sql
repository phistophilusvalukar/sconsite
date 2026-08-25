/* Attach foreground decorations to the profile document, portrait, or backstory flow. */

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_foreground_anchor text NOT NULL DEFAULT 'page';

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_foreground_anchor_check,
  ADD CONSTRAINT characters_profile_foreground_anchor_check
    CHECK (profile_foreground_anchor IN ('page', 'portrait', 'backstory'));

CREATE OR REPLACE FUNCTION public.update_character_profile_v12_command(
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
  v_foreground_anchor text := COALESCE(NULLIF(p_profile->>'foregroundAnchor', ''), 'page');
BEGIN
  IF v_foreground_anchor NOT IN ('page', 'portrait', 'backstory') THEN
    RAISE EXCEPTION 'Invalid foreground image anchor';
  END IF;

  v_updated := public.update_character_profile_v11_command(
    p_character_id,
    p_profile,
    p_change_shape_enabled,
    p_alternate_shape
  );

  IF v_updated THEN
    UPDATE public.characters
    SET profile_foreground_anchor = v_foreground_anchor,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v12_command(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v12_command(uuid, jsonb, boolean, jsonb) TO authenticated;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_foreground_anchor;

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
      '{character,profile_foreground_anchor}',
      to_jsonb(character.profile_foreground_anchor),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_foreground_anchor(character.id) AS payload
  ) public_profile
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
