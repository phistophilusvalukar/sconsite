/* Let profile owners select shadow and surface contrast for dark or light palettes. */

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_theme_mode text NOT NULL DEFAULT 'dark';

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_theme_mode_check,
  ADD CONSTRAINT characters_profile_theme_mode_check CHECK (profile_theme_mode IN ('dark', 'light'));

ALTER TABLE public.guilds
  ADD COLUMN IF NOT EXISTS theme_mode text NOT NULL DEFAULT 'dark';

ALTER TABLE public.guilds
  DROP CONSTRAINT IF EXISTS guilds_theme_mode_check,
  ADD CONSTRAINT guilds_theme_mode_check CHECK (theme_mode IN ('dark', 'light'));

CREATE OR REPLACE FUNCTION public.update_character_profile_v9_command(
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
  v_theme_mode text := COALESCE(NULLIF(p_profile->>'themeMode', ''), 'dark');
BEGIN
  IF v_theme_mode NOT IN ('dark', 'light') THEN
    RAISE EXCEPTION 'Theme mode must be dark or light';
  END IF;

  v_updated := public.update_character_profile_v8_command(
    p_character_id,
    p_profile,
    p_change_shape_enabled,
    p_alternate_shape
  );

  IF v_updated THEN
    UPDATE public.characters
    SET profile_theme_mode = v_theme_mode,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v9_command(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v9_command(uuid, jsonb, boolean, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_guild_profile_v7_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated boolean;
  v_theme_mode text := COALESCE(NULLIF(p_profile->>'themeMode', ''), 'dark');
BEGIN
  IF v_theme_mode NOT IN ('dark', 'light') THEN
    RAISE EXCEPTION 'Theme mode must be dark or light';
  END IF;

  v_updated := public.update_guild_profile_v6_command(p_guild_id, p_profile);

  IF v_updated THEN
    UPDATE public.guilds
    SET theme_mode = v_theme_mode,
        updated_at = now()
    WHERE id = p_guild_id;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_guild_profile_v7_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_guild_profile_v7_command(uuid, jsonb) TO authenticated;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_contrast_theme;

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
      '{character,profile_theme_mode}',
      to_jsonb(character.profile_theme_mode),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_contrast_theme(character.id) AS payload
  ) public_profile
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
