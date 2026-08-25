/* Allow foreground decorations to attach to either side of the scrolling profile page. */

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_foreground_anchor_check,
  ADD CONSTRAINT characters_profile_foreground_anchor_check
    CHECK (profile_foreground_anchor IN ('page', 'left', 'right', 'portrait', 'backstory'));

CREATE OR REPLACE FUNCTION public.update_character_profile_v13_command(
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
  IF v_foreground_anchor NOT IN ('page', 'left', 'right', 'portrait', 'backstory') THEN
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

REVOKE ALL ON FUNCTION public.update_character_profile_v13_command(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v13_command(uuid, jsonb, boolean, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
