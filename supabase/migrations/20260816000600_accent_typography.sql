/* Add independently scalable typography for buttons, tabs, badges, and accent labels. */

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_accent_font_family text NOT NULL DEFAULT 'inter',
  ADD COLUMN IF NOT EXISTS profile_accent_font_size integer NOT NULL DEFAULT 13;

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_profile_accent_font_size_check,
  DROP CONSTRAINT IF EXISTS characters_profile_accent_font_family_check,
  ADD CONSTRAINT characters_profile_accent_font_size_check CHECK (profile_accent_font_size BETWEEN 10 AND 28),
  ADD CONSTRAINT characters_profile_accent_font_family_check CHECK (profile_accent_font_family IN ('cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p'));

UPDATE public.characters
SET profile_accent_font_family = profile_font_family
WHERE profile_accent_font_family = 'inter' AND profile_font_family <> 'inter';

ALTER TABLE public.guilds
  ADD COLUMN IF NOT EXISTS accent_font_family text NOT NULL DEFAULT 'inter',
  ADD COLUMN IF NOT EXISTS accent_font_size integer NOT NULL DEFAULT 13;

ALTER TABLE public.guilds
  DROP CONSTRAINT IF EXISTS guilds_accent_font_size_check,
  DROP CONSTRAINT IF EXISTS guilds_accent_font_family_check,
  ADD CONSTRAINT guilds_accent_font_size_check CHECK (accent_font_size BETWEEN 10 AND 28),
  ADD CONSTRAINT guilds_accent_font_family_check CHECK (accent_font_family IN ('cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p'));

UPDATE public.guilds
SET accent_font_family = font_family
WHERE accent_font_family = 'inter' AND font_family <> 'inter';

CREATE OR REPLACE FUNCTION public.update_character_profile_v8_command(
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
  v_accent_font_size integer := COALESCE((p_profile->>'accentFontSize')::integer, 13);
BEGIN
  IF v_accent_font_size NOT BETWEEN 10 AND 28 THEN
    RAISE EXCEPTION 'Accent font size must be between 10 and 28';
  END IF;

  v_updated := public.update_character_profile_v7_command(
    p_character_id,
    p_profile,
    p_change_shape_enabled,
    p_alternate_shape
  );

  IF v_updated THEN
    UPDATE public.characters
    SET profile_accent_font_family = COALESCE(NULLIF(p_profile->>'accentFontFamily', ''), profile_font_family),
        profile_accent_font_size = v_accent_font_size,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v8_command(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v8_command(uuid, jsonb, boolean, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_guild_profile_v6_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated boolean;
  v_accent_font_size integer := COALESCE((p_profile->>'accentFontSize')::integer, 13);
BEGIN
  IF v_accent_font_size NOT BETWEEN 10 AND 28 THEN
    RAISE EXCEPTION 'Accent font size must be between 10 and 28';
  END IF;

  v_updated := public.update_guild_profile_v5_command(p_guild_id, p_profile);

  IF v_updated THEN
    UPDATE public.guilds
    SET accent_font_family = COALESCE(NULLIF(p_profile->>'accentFontFamily', ''), font_family),
        accent_font_size = v_accent_font_size,
        updated_at = now()
    WHERE id = p_guild_id;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_guild_profile_v6_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_guild_profile_v6_command(uuid, jsonb) TO authenticated;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_accent_typography;

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
        '{character,profile_accent_font_family}',
        to_jsonb(character.profile_accent_font_family),
        true
      ),
      '{character,profile_accent_font_size}',
      to_jsonb(character.profile_accent_font_size),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_accent_typography(character.id) AS payload
  ) public_profile
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
