/*
  # Dynamic character portraits and expanded fantasy typography

  Character owners can save a hosted scenic background and transparent cutout
  for a site-wide layered portrait. Guild and character pages also gain Savage,
  Fancy, and Whimsical font collections. Protected profile commands remain the
  authoritative write path.
*/

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS profile_dynamic_portrait_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_portrait_background_url text,
  ADD COLUMN IF NOT EXISTS profile_portrait_cutout_url text;

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_font_family_check,
  ADD CONSTRAINT guilds_font_family_check CHECK (
    font_family IN (
      'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
      'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
      'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest'
    )
  );

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_profile_font_family_check,
  ADD CONSTRAINT characters_profile_font_family_check CHECK (
    profile_font_family IN (
      'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
      'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
      'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest'
    )
  );

CREATE OR REPLACE FUNCTION update_character_profile_command(p_character_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sections jsonb := COALESCE(p_profile->'sectionVisibility', '{}'::jsonb);
  v_font text := COALESCE(p_profile->>'fontFamily', 'cinzel');
  v_layout text := COALESCE(p_profile->>'layoutStyle', 'chronicle');
  v_font_color text := COALESCE(p_profile->>'fontColor', '#f4efe6');
  v_base_color text := COALESCE(p_profile->>'baseColor', '#18201f');
  v_accent_color text := COALESCE(p_profile->>'accentColor', '#c9954a');
  v_banner_image_url text := NULLIF(trim(COALESCE(p_profile->>'bannerImageUrl', '')), '');
  v_dynamic_portrait_enabled boolean;
  v_portrait_background_url text := NULLIF(trim(COALESCE(p_profile->>'portraitBackgroundImageUrl', '')), '');
  v_portrait_cutout_url text := NULLIF(trim(COALESCE(p_profile->>'portraitCutoutImageUrl', '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM characters
    WHERE id = p_character_id AND user_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Only the character owner can customize this page';
  END IF;

  IF jsonb_typeof(p_profile->'dynamicPortraitEnabled') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid Dynamic Portrait setting';
  END IF;
  v_dynamic_portrait_enabled := (p_profile->>'dynamicPortraitEnabled')::boolean;

  IF length(trim(COALESCE(p_profile->>'subtitle', ''))) > 140 THEN
    RAISE EXCEPTION 'Character subtitle is too long';
  END IF;
  IF v_font NOT IN (
       'cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze',
       'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative',
       'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest'
     ) OR v_layout NOT IN ('chronicle', 'dossier', 'spotlight', 'saga') THEN
    RAISE EXCEPTION 'Invalid character presentation option';
  END IF;
  IF v_font_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_base_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid character color';
  END IF;
  IF (v_banner_image_url IS NOT NULL AND v_banner_image_url !~ '^https://')
     OR (v_portrait_background_url IS NOT NULL AND v_portrait_background_url !~ '^https://')
     OR (v_portrait_cutout_url IS NOT NULL AND v_portrait_cutout_url !~ '^https://') THEN
    RAISE EXCEPTION 'Character artwork must use direct HTTPS URLs';
  END IF;
  IF length(COALESCE(v_banner_image_url, '')) > 2000
     OR length(COALESCE(v_portrait_background_url, '')) > 2000
     OR length(COALESCE(v_portrait_cutout_url, '')) > 2000 THEN
    RAISE EXCEPTION 'Character artwork URL is too long';
  END IF;
  IF v_dynamic_portrait_enabled
     AND (v_portrait_background_url IS NULL OR v_portrait_cutout_url IS NULL) THEN
    RAISE EXCEPTION 'Dynamic Portrait requires a background and transparent cutout';
  END IF;
  IF jsonb_typeof(v_sections) <> 'object'
     OR (SELECT count(*) FROM jsonb_each(v_sections)) <> 7
     OR (SELECT count(*) FROM jsonb_each(v_sections) WHERE key NOT IN (
       'portrait', 'details', 'abilityMatrix', 'backstory', 'notes', 'journal', 'relationships'
     )) > 0
     OR (SELECT count(*) FROM jsonb_each(v_sections) WHERE jsonb_typeof(value) <> 'boolean') > 0 THEN
    RAISE EXCEPTION 'Invalid character section visibility settings';
  END IF;

  UPDATE characters
  SET profile_subtitle = left(trim(COALESCE(p_profile->>'subtitle', '')), 140),
      profile_font_family = v_font,
      profile_font_color = v_font_color,
      profile_base_color = v_base_color,
      profile_accent_color = v_accent_color,
      profile_banner_image_url = v_banner_image_url,
      profile_dynamic_portrait_enabled = v_dynamic_portrait_enabled,
      profile_portrait_background_url = v_portrait_background_url,
      profile_portrait_cutout_url = v_portrait_cutout_url,
      profile_layout_style = v_layout,
      profile_section_visibility = jsonb_build_object(
        'portrait', (v_sections->>'portrait')::boolean,
        'details', (v_sections->>'details')::boolean,
        'abilityMatrix', (v_sections->>'abilityMatrix')::boolean,
        'backstory', (v_sections->>'backstory')::boolean,
        'notes', (v_sections->>'notes')::boolean,
        'journal', (v_sections->>'journal')::boolean,
        'relationships', (v_sections->>'relationships')::boolean
      ),
      updated_at = now()
  WHERE id = p_character_id;

  RETURN FOUND;
END;
$$;

-- The guild command is otherwise unchanged from the preceding migration. Patch
-- its validated allow-list from the catalog so this migration does not duplicate
-- a large security-definer function and accidentally let the two copies drift.
DO $migration$
DECLARE
  v_definition text;
  v_old_fonts text := '''cinzel'', ''cormorant'', ''merriweather'', ''inter'', ''alegreya'', ''im-fell'', ''uncial'', ''pirata'', ''grenze''';
  v_new_fonts text := '''cinzel'', ''cormorant'', ''merriweather'', ''inter'', ''alegreya'', ''im-fell'', ''uncial'', ''pirata'', ''grenze'', ''caesar'', ''metal-mania'', ''new-rocker'', ''trade-winds'', ''great-vibes'', ''marcellus'', ''cinzel-decorative'', ''tangerine'', ''almendra-display'', ''henny-penny'', ''macondo'', ''mystery-quest''';
BEGIN
  SELECT pg_get_functiondef('update_guild_profile_command(uuid,jsonb)'::regprocedure)
  INTO v_definition;
  v_definition := replace(v_definition, v_old_fonts, v_new_fonts);
  IF position('metal-mania' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not expand the guild profile font allow-list';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION update_character_profile_command(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_command(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;
