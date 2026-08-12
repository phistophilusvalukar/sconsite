/*
  # Expanded profile typography, saga layouts, and title banners

  Guildmasters and character owners can select additional dramatic fonts,
  choose the new Saga layout, and place a direct HTTPS image behind the page
  title. Both profile commands remain the only supported write path.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS banner_image_url text;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS profile_banner_image_url text;

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_font_family_check,
  DROP CONSTRAINT IF EXISTS guilds_layout_style_check,
  ADD CONSTRAINT guilds_font_family_check CHECK (
    font_family IN ('cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze')
  ),
  ADD CONSTRAINT guilds_layout_style_check CHECK (
    layout_style IN ('chronicle', 'stronghold', 'banner', 'saga')
  );

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_profile_font_family_check,
  DROP CONSTRAINT IF EXISTS characters_profile_layout_style_check,
  ADD CONSTRAINT characters_profile_font_family_check CHECK (
    profile_font_family IN ('cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze')
  ),
  ADD CONSTRAINT characters_profile_layout_style_check CHECK (
    profile_layout_style IN ('chronicle', 'dossier', 'spotlight', 'saga')
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
  IF v_font NOT IN ('cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze')
     OR v_layout NOT IN ('chronicle', 'dossier', 'spotlight', 'saga') THEN
    RAISE EXCEPTION 'Invalid character presentation option';
  END IF;
  IF v_font_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_base_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid character color';
  END IF;
  IF v_banner_image_url IS NOT NULL AND v_banner_image_url !~ '^https://' THEN
    RAISE EXCEPTION 'Character banner must use a direct HTTPS URL';
  END IF;
  IF length(COALESCE(v_banner_image_url, '')) > 2000 THEN
    RAISE EXCEPTION 'Character banner URL is too long';
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

CREATE OR REPLACE FUNCTION update_guild_profile_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles jsonb := COALESCE(p_profile->'roleLabels', '{}'::jsonb);
  v_sections jsonb := COALESCE(p_profile->'sectionVisibility', '{}'::jsonb);
  v_font text := COALESCE(p_profile->>'fontFamily', 'cinzel');
  v_layout text := COALESCE(p_profile->>'layoutStyle', 'chronicle');
  v_roster_display text := COALESCE(p_profile->>'rosterDisplay', 'ledger');
  v_animation text := COALESCE(p_profile->>'titleAnimation', 'none');
  v_font_color text := COALESCE(p_profile->>'fontColor', '#f8fafc');
  v_base_color text := COALESCE(p_profile->>'baseColor', '#171425');
  v_accent_color text := COALESCE(p_profile->>'accentColor', '#d6a84b');
  v_emblem_url text := NULLIF(trim(COALESCE(p_profile->>'emblemUrl', '')), '');
  v_banner_image_url text := NULLIF(trim(COALESCE(p_profile->>'bannerImageUrl', '')), '');
  v_headquarters_image_url text := NULLIF(trim(COALESCE(p_profile->>'headquartersImageUrl', '')), '');
  v_title_html text := trim(COALESCE(p_profile->>'titleHtml', ''));
  v_description_html text := trim(COALESCE(p_profile->>'descriptionHtml', ''));
  v_headquarters_title_html text := trim(COALESCE(p_profile->>'headquartersTitleHtml', ''));
  v_headquarters_description_html text := trim(COALESCE(p_profile->>'headquartersDescriptionHtml', ''));
  v_message_board_html text := trim(COALESCE(p_profile->>'messageBoardHtml', ''));
  v_combined_html text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text) THEN
    RAISE EXCEPTION 'Only the guildmaster can customize this guild';
  END IF;
  IF length(trim(COALESCE(p_profile->>'name', ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Guild name must be between 2 and 80 characters';
  END IF;
  IF length(v_title_html) > 1200 OR length(v_description_html) > 12000
     OR length(v_headquarters_title_html) > 1200 OR length(v_headquarters_description_html) > 10000
     OR length(v_message_board_html) > 12000 THEN
    RAISE EXCEPTION 'Guild rich text is too long';
  END IF;

  v_combined_html := v_title_html || v_description_html || v_headquarters_title_html
    || v_headquarters_description_html || v_message_board_html;
  IF v_combined_html ~* '<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|video|audio|canvas|link|meta|base)'
     OR v_combined_html ~* '\son[a-z]+\s*='
     OR v_combined_html ~* '(href|src)\s*=\s*["'']?\s*(javascript|vbscript|data):' THEN
    RAISE EXCEPTION 'Guild rich text contains unsafe HTML';
  END IF;

  IF v_font NOT IN ('cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze')
     OR v_layout NOT IN ('chronicle', 'stronghold', 'banner', 'saga')
     OR v_roster_display NOT IN ('ledger', 'dossiers', 'cards')
     OR v_animation NOT IN ('none', 'reveal', 'shimmer', 'drift', 'glow') THEN
    RAISE EXCEPTION 'Invalid guild presentation option';
  END IF;
  IF v_font_color !~ '^#[0-9A-Fa-f]{6}$' OR v_base_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid guild color';
  END IF;
  IF (v_emblem_url IS NOT NULL AND v_emblem_url !~ '^https://')
     OR (v_banner_image_url IS NOT NULL AND v_banner_image_url !~ '^https://')
     OR (v_headquarters_image_url IS NOT NULL AND v_headquarters_image_url !~ '^https://') THEN
    RAISE EXCEPTION 'Guild artwork must use direct HTTPS URLs';
  END IF;
  IF length(COALESCE(v_emblem_url, '')) > 2000
     OR length(COALESCE(v_banner_image_url, '')) > 2000
     OR length(COALESCE(v_headquarters_image_url, '')) > 2000 THEN
    RAISE EXCEPTION 'Guild artwork URL is too long';
  END IF;
  IF jsonb_typeof(v_roles) <> 'object'
     OR COALESCE(length(trim(v_roles->>'Leader')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Subleader')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Officer')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Member')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Ally')), 0) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Every roster tier needs a label';
  END IF;
  IF jsonb_typeof(v_sections) <> 'object'
     OR (SELECT count(*) FROM jsonb_each(v_sections)) <> 8
     OR (SELECT count(*) FROM jsonb_each(v_sections) WHERE key NOT IN (
       'charter', 'requirements', 'headquarters', 'leader', 'roster', 'messageBoard', 'checkIn', 'guestbook'
     )) > 0
     OR (SELECT count(*) FROM jsonb_each(v_sections) WHERE jsonb_typeof(value) <> 'boolean') > 0 THEN
    RAISE EXCEPTION 'Invalid section visibility settings';
  END IF;
  IF jsonb_typeof(p_profile->'guestbookEnabled') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid guestbook setting';
  END IF;

  UPDATE guilds
  SET name = trim(p_profile->>'name'),
      title_html = v_title_html,
      title_animation = v_animation,
      subtitle = left(trim(COALESCE(p_profile->>'subtitle', '')), 140),
      description = left(trim(COALESCE(p_profile->>'description', '')), 4000),
      description_html = v_description_html,
      font_family = v_font,
      font_color = v_font_color,
      base_color = v_base_color,
      accent_color = v_accent_color,
      layout_style = v_layout,
      roster_display = v_roster_display,
      section_visibility = jsonb_build_object(
        'charter', (v_sections->>'charter')::boolean,
        'requirements', (v_sections->>'requirements')::boolean,
        'headquarters', (v_sections->>'headquarters')::boolean,
        'leader', (v_sections->>'leader')::boolean,
        'roster', (v_sections->>'roster')::boolean,
        'messageBoard', (v_sections->>'messageBoard')::boolean,
        'checkIn', (v_sections->>'checkIn')::boolean,
        'guestbook', (v_sections->>'guestbook')::boolean
      ),
      emblem_url = v_emblem_url,
      banner_image_url = v_banner_image_url,
      headquarters_name = left(trim(COALESCE(p_profile->>'headquartersName', '')), 100),
      headquarters_title = left(trim(COALESCE(p_profile->>'headquartersTitle', '')), 140),
      headquarters_title_html = v_headquarters_title_html,
      headquarters_description = left(trim(COALESCE(p_profile->>'headquartersDescription', '')), 3000),
      headquarters_description_html = v_headquarters_description_html,
      headquarters_image_url = v_headquarters_image_url,
      requirements = left(trim(COALESCE(p_profile->>'requirements', '')), 2000),
      message_board_updated_at = CASE WHEN message_board_html IS DISTINCT FROM v_message_board_html THEN now() ELSE message_board_updated_at END,
      message_board_html = v_message_board_html,
      guestbook_enabled = COALESCE((p_profile->>'guestbookEnabled')::boolean, true),
      role_labels = jsonb_build_object(
        'Leader', trim(v_roles->>'Leader'), 'Subleader', trim(v_roles->>'Subleader'),
        'Officer', trim(v_roles->>'Officer'), 'Member', trim(v_roles->>'Member'),
        'Ally', trim(v_roles->>'Ally')
      ),
      updated_at = now()
  WHERE id = p_guild_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_character_profile_command(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_character_profile_command(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;
