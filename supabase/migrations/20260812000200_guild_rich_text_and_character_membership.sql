/*
  # Guild rich text and character-scoped membership

  Guild pages store sanitized rich HTML while retaining plain-text searchable
  fields. Artwork uses direct HTTPS URLs. Core guild limits apply per character,
  allowing different characters on one account to join or lead different guilds.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS title_html text DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_animation text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS description_html text DEFAULT '',
  ADD COLUMN IF NOT EXISTS headquarters_title_html text DEFAULT '',
  ADD COLUMN IF NOT EXISTS headquarters_description_html text DEFAULT '';

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_title_animation_check;

ALTER TABLE guilds
  ADD CONSTRAINT guilds_title_animation_check
  CHECK (title_animation IN ('none', 'reveal', 'shimmer', 'drift', 'glow'));

DROP INDEX IF EXISTS idx_guilds_one_leader_per_user;
DROP INDEX IF EXISTS idx_guilds_one_leader_per_character;
CREATE UNIQUE INDEX idx_guilds_one_leader_per_character
  ON guilds(leader_character_id)
  WHERE status <> 'Inactive' AND leader_character_id IS NOT NULL;

DROP INDEX IF EXISTS idx_guild_memberships_one_core_guild_per_user;
DROP INDEX IF EXISTS idx_guild_memberships_one_core_guild_per_character;
CREATE UNIQUE INDEX idx_guild_memberships_one_core_guild_per_character
  ON guild_memberships(character_id)
  WHERE role_category IN ('Leader', 'Subleader', 'Officer', 'Member')
    AND membership_status = 'Active'
    AND character_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_guild_profile_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles jsonb := COALESCE(p_profile->'roleLabels', '{}'::jsonb);
  v_font text := COALESCE(p_profile->>'fontFamily', 'cinzel');
  v_layout text := COALESCE(p_profile->>'layoutStyle', 'chronicle');
  v_animation text := COALESCE(p_profile->>'titleAnimation', 'none');
  v_font_color text := COALESCE(p_profile->>'fontColor', '#f8fafc');
  v_base_color text := COALESCE(p_profile->>'baseColor', '#171425');
  v_accent_color text := COALESCE(p_profile->>'accentColor', '#d6a84b');
  v_emblem_url text := NULLIF(trim(COALESCE(p_profile->>'emblemUrl', '')), '');
  v_headquarters_image_url text := NULLIF(trim(COALESCE(p_profile->>'headquartersImageUrl', '')), '');
  v_title_html text := trim(COALESCE(p_profile->>'titleHtml', ''));
  v_description_html text := trim(COALESCE(p_profile->>'descriptionHtml', ''));
  v_headquarters_title_html text := trim(COALESCE(p_profile->>'headquartersTitleHtml', ''));
  v_headquarters_description_html text := trim(COALESCE(p_profile->>'headquartersDescriptionHtml', ''));
  v_combined_html text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Only the guildmaster can customize this guild';
  END IF;

  IF length(trim(COALESCE(p_profile->>'name', ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Guild name must be between 2 and 80 characters';
  END IF;

  IF length(v_title_html) > 1200
     OR length(v_description_html) > 12000
     OR length(v_headquarters_title_html) > 1200
     OR length(v_headquarters_description_html) > 10000 THEN
    RAISE EXCEPTION 'Guild rich text is too long';
  END IF;

  v_combined_html := v_title_html || v_description_html || v_headquarters_title_html || v_headquarters_description_html;
  IF v_combined_html ~* '<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|video|audio|canvas|link|meta|base)'
     OR v_combined_html ~* '\son[a-z]+\s*='
     OR v_combined_html ~* '(href|src)\s*=\s*["'']?\s*(javascript|vbscript|data):' THEN
    RAISE EXCEPTION 'Guild rich text contains unsafe HTML';
  END IF;

  IF v_font NOT IN ('cinzel', 'cormorant', 'merriweather', 'inter')
     OR v_layout NOT IN ('chronicle', 'stronghold', 'banner')
     OR v_animation NOT IN ('none', 'reveal', 'shimmer', 'drift', 'glow') THEN
    RAISE EXCEPTION 'Invalid guild presentation option';
  END IF;

  IF v_font_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_base_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid guild color';
  END IF;

  IF (v_emblem_url IS NOT NULL AND v_emblem_url !~ '^https://')
     OR (v_headquarters_image_url IS NOT NULL AND v_headquarters_image_url !~ '^https://') THEN
    RAISE EXCEPTION 'Guild artwork must use direct HTTPS URLs';
  END IF;

  IF jsonb_typeof(v_roles) <> 'object'
     OR COALESCE(length(trim(v_roles->>'Leader')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Subleader')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Officer')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Member')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Ally')), 0) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Every roster tier needs a label';
  END IF;

  UPDATE guilds
  SET
    name = trim(p_profile->>'name'),
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
    emblem_url = v_emblem_url,
    headquarters_name = left(trim(COALESCE(p_profile->>'headquartersName', '')), 100),
    headquarters_title = left(trim(COALESCE(p_profile->>'headquartersTitle', '')), 140),
    headquarters_title_html = v_headquarters_title_html,
    headquarters_description = left(trim(COALESCE(p_profile->>'headquartersDescription', '')), 3000),
    headquarters_description_html = v_headquarters_description_html,
    headquarters_image_url = v_headquarters_image_url,
    role_labels = jsonb_build_object(
      'Leader', trim(v_roles->>'Leader'),
      'Subleader', trim(v_roles->>'Subleader'),
      'Officer', trim(v_roles->>'Officer'),
      'Member', trim(v_roles->>'Member'),
      'Ally', trim(v_roles->>'Ally')
    ),
    updated_at = now()
  WHERE id = p_guild_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;
