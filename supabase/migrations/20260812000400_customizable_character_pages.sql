/*
  # Dedicated customizable character pages

  Character presentation settings are stored with the character and can only be
  changed through an authenticated, owner-checked command.
*/

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS profile_subtitle text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_font_family text NOT NULL DEFAULT 'cinzel',
  ADD COLUMN IF NOT EXISTS profile_font_color text NOT NULL DEFAULT '#f4efe6',
  ADD COLUMN IF NOT EXISTS profile_base_color text NOT NULL DEFAULT '#18201f',
  ADD COLUMN IF NOT EXISTS profile_accent_color text NOT NULL DEFAULT '#c9954a',
  ADD COLUMN IF NOT EXISTS profile_layout_style text NOT NULL DEFAULT 'chronicle',
  ADD COLUMN IF NOT EXISTS profile_section_visibility jsonb NOT NULL DEFAULT '{
    "portrait": true,
    "details": true,
    "abilityMatrix": true,
    "backstory": true,
    "notes": true,
    "journal": true,
    "relationships": true
  }'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_profile_font_family_check') THEN
    ALTER TABLE characters ADD CONSTRAINT characters_profile_font_family_check
      CHECK (profile_font_family IN ('cinzel', 'cormorant', 'merriweather', 'inter'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_profile_layout_style_check') THEN
    ALTER TABLE characters ADD CONSTRAINT characters_profile_layout_style_check
      CHECK (profile_layout_style IN ('chronicle', 'dossier', 'spotlight'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_profile_colors_check') THEN
    ALTER TABLE characters ADD CONSTRAINT characters_profile_colors_check
      CHECK (
        profile_font_color ~ '^#[0-9A-Fa-f]{6}$'
        AND profile_base_color ~ '^#[0-9A-Fa-f]{6}$'
        AND profile_accent_color ~ '^#[0-9A-Fa-f]{6}$'
      );
  END IF;
END $$;

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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM characters
    WHERE id = p_character_id AND user_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Only the character owner can customize this page';
  END IF;

  IF length(trim(COALESCE(p_profile->>'subtitle', ''))) > 140 THEN
    RAISE EXCEPTION 'Character subtitle is too long';
  END IF;
  IF v_font NOT IN ('cinzel', 'cormorant', 'merriweather', 'inter')
     OR v_layout NOT IN ('chronicle', 'dossier', 'spotlight') THEN
    RAISE EXCEPTION 'Invalid character presentation option';
  END IF;
  IF v_font_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_base_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid character color';
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

REVOKE ALL ON FUNCTION update_character_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_command(uuid, jsonb) TO authenticated;
