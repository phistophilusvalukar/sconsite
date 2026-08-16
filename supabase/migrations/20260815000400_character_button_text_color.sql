/* Add an independently editable text color for accent-colored controls. */

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_button_text_color text NOT NULL DEFAULT '#111615';

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_button_text_color_check,
  ADD CONSTRAINT characters_profile_button_text_color_check
    CHECK (profile_button_text_color ~ '^#[0-9A-Fa-f]{6}$');

CREATE OR REPLACE FUNCTION public.update_character_profile_v5_command(
  p_character_id uuid,
  p_profile jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_button_text_color text;
  v_updated boolean;
  v_row_count integer := 0;
BEGIN
  v_button_text_color := COALESCE(p_profile->>'buttonTextColor', '#111615');
  IF v_button_text_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid button text color';
  END IF;

  v_updated := public.update_character_profile_v4_command(p_character_id, p_profile);
  IF v_updated THEN
    UPDATE public.characters
    SET profile_button_text_color = v_button_text_color,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
  END IF;

  RETURN v_updated AND v_row_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v5_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v5_command(uuid, jsonb) TO authenticated;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_button_text;

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
      '{character,profile_button_text_color}',
      to_jsonb(character.profile_button_text_color),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_button_text(character.id) AS payload
  ) public_profile
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
