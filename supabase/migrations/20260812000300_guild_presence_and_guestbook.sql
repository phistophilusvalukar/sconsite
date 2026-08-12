/*
  # Guild presence, guestbooks, and presentation controls

  Adds section visibility, roster presentation, an editable message board,
  character check-ins that award influence, and a moderated roleplay guestbook.
  Check-in uniqueness is enforced per character per UTC database day.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS roster_display text DEFAULT 'ledger',
  ADD COLUMN IF NOT EXISTS section_visibility jsonb DEFAULT '{"charter":true,"requirements":true,"headquarters":true,"leader":true,"roster":true,"messageBoard":true,"checkIn":true,"guestbook":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS message_board_html text DEFAULT '',
  ADD COLUMN IF NOT EXISTS message_board_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS guestbook_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS influence_points integer NOT NULL DEFAULT 0;

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_roster_display_check,
  DROP CONSTRAINT IF EXISTS guilds_influence_points_check;

ALTER TABLE guilds
  ADD CONSTRAINT guilds_roster_display_check CHECK (roster_display IN ('ledger', 'dossiers', 'cards')),
  ADD CONSTRAINT guilds_influence_points_check CHECK (influence_points >= 0);

-- Influence is canonical server-owned state. Existing guild update policies
-- may allow leaders to edit their profile, so explicitly reject direct point
-- changes while allowing SECURITY DEFINER commands owned by the database.
CREATE OR REPLACE FUNCTION guard_guild_influence_points()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.influence_points IS DISTINCT FROM OLD.influence_points
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Guild influence can only be changed by a protected command';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_guild_influence_points_trigger ON guilds;
CREATE TRIGGER guard_guild_influence_points_trigger
  BEFORE UPDATE OF influence_points ON guilds
  FOR EACH ROW EXECUTE FUNCTION guard_guild_influence_points();

-- Membership and application identity is character-scoped. One account may
-- therefore bring different characters into the same guild independently.
ALTER TABLE guild_memberships
  DROP CONSTRAINT IF EXISTS guild_memberships_guild_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_memberships_guild_character
  ON guild_memberships(guild_id, character_id)
  WHERE character_id IS NOT NULL;

ALTER TABLE guild_applications
  DROP CONSTRAINT IF EXISTS guild_applications_guild_id_user_id_status_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_applications_guild_character_status
  ON guild_applications(guild_id, character_id, status)
  WHERE character_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS guild_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  checkin_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  influence_awarded integer NOT NULL DEFAULT 1 CHECK (influence_awarded > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(character_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_guild_checkins_guild_date
  ON guild_checkins(guild_id, checkin_date DESC);

CREATE TABLE IF NOT EXISTS guild_guestbook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 1200),
  hidden_at timestamptz,
  hidden_by text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guild_guestbook_guild_created
  ON guild_guestbook_entries(guild_id, created_at DESC);

ALTER TABLE guild_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_guestbook_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read guild checkins" ON guild_checkins;
CREATE POLICY "Authenticated users can read guild checkins"
  ON guild_checkins FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Visitors can read visible guild guestbook entries" ON guild_guestbook_entries;
CREATE POLICY "Visitors can read visible guild guestbook entries"
  ON guild_guestbook_entries FOR SELECT TO authenticated
  USING (
    hidden_at IS NULL
    OR author_user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM guilds
      WHERE guilds.id = guild_guestbook_entries.guild_id
        AND guilds.leader_id = auth.uid()::text
    )
  );

CREATE OR REPLACE FUNCTION check_in_guild_character_command(p_guild_id uuid, p_character_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_influence integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM guild_memberships gm
    JOIN characters c ON c.id = gm.character_id
    WHERE gm.guild_id = p_guild_id
      AND gm.character_id = p_character_id
      AND gm.user_id = auth.uid()::text
      AND c.user_id = auth.uid()::text
      AND gm.membership_status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Only an active guild character can check in';
  END IF;

  INSERT INTO guild_checkins (guild_id, character_id, user_id, checkin_date, influence_awarded)
  VALUES (p_guild_id, p_character_id, auth.uid()::text, (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (character_id, checkin_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    UPDATE guilds
    SET influence_points = influence_points + 1,
        updated_at = now()
    WHERE id = p_guild_id
    RETURNING influence_points INTO v_influence;
  ELSE
    SELECT influence_points INTO v_influence FROM guilds WHERE id = p_guild_id;
  END IF;

  RETURN jsonb_build_object(
    'awarded', v_inserted = 1,
    'influencePoints', COALESCE(v_influence, 0),
    'checkinDate', ((now() AT TIME ZONE 'UTC')::date)::text
  );
END;
$$;

REVOKE ALL ON FUNCTION check_in_guild_character_command(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_in_guild_character_command(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION sign_guild_guestbook_command(
  p_guild_id uuid,
  p_character_id uuid,
  p_message text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM guilds WHERE id = p_guild_id AND guestbook_enabled = true
  ) THEN
    RAISE EXCEPTION 'This guild guestbook is closed';
  END IF;

  IF length(trim(COALESCE(p_message, ''))) NOT BETWEEN 1 AND 1200 THEN
    RAISE EXCEPTION 'Guestbook messages must be between 1 and 1200 characters';
  END IF;

  IF p_character_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM characters
    WHERE id = p_character_id AND user_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'That character does not belong to you';
  END IF;

  INSERT INTO guild_guestbook_entries (guild_id, author_user_id, character_id, message)
  VALUES (p_guild_id, auth.uid()::text, p_character_id, trim(p_message));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION sign_guild_guestbook_command(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_guild_guestbook_command(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION moderate_guild_guestbook_command(
  p_guild_id uuid,
  p_entry_id uuid,
  p_hidden boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Only the guildmaster can moderate this guestbook';
  END IF;

  UPDATE guild_guestbook_entries
  SET hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END,
      hidden_by = CASE WHEN p_hidden THEN auth.uid()::text ELSE NULL END,
      updated_at = now()
  WHERE id = p_entry_id AND guild_id = p_guild_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION moderate_guild_guestbook_command(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION moderate_guild_guestbook_command(uuid, uuid, boolean) TO authenticated;

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

  IF v_font NOT IN ('cinzel', 'cormorant', 'merriweather', 'inter')
     OR v_layout NOT IN ('chronicle', 'stronghold', 'banner')
     OR v_roster_display NOT IN ('ledger', 'dossiers', 'cards')
     OR v_animation NOT IN ('none', 'reveal', 'shimmer', 'drift', 'glow') THEN
    RAISE EXCEPTION 'Invalid guild presentation option';
  END IF;
  IF v_font_color !~ '^#[0-9A-Fa-f]{6}$' OR v_base_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid guild color';
  END IF;
  IF (v_emblem_url IS NOT NULL AND v_emblem_url !~ '^https://')
     OR (v_headquarters_image_url IS NOT NULL AND v_headquarters_image_url !~ '^https://') THEN
    RAISE EXCEPTION 'Guild artwork must use direct HTTPS URLs';
  END IF;
  IF length(COALESCE(v_emblem_url, '')) > 2000 OR length(COALESCE(v_headquarters_image_url, '')) > 2000 THEN
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

REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'guild_checkins'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE guild_checkins;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'guild_guestbook_entries'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE guild_guestbook_entries;
    END IF;
  END IF;
END $$;
