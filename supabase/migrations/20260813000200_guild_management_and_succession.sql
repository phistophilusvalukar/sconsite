/*
  # Guild management and automatic leadership succession

  Adds per-character officer privileges, protected management commands, and
  check-in-driven automatic leadership. Public roster data remains read-only.
*/

ALTER TABLE guild_memberships
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{
    "kickMembers":false,
    "setMessageBoard":false,
    "acceptApplications":false,
    "customizeGuild":false
  }'::jsonb;

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS auto_leader_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_leader_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_leader_awaiting_checkin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_leader_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leadership_changed_at timestamptz;

CREATE OR REPLACE FUNCTION guild_has_permission(p_guild_id uuid, p_permission text, p_user_id text DEFAULT auth.uid()::text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id = auth.uid()::text AND (EXISTS (
    SELECT 1 FROM guilds g
    WHERE g.id = p_guild_id AND g.leader_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM guild_memberships gm
    WHERE gm.guild_id = p_guild_id
      AND gm.user_id = p_user_id
      AND gm.membership_status = 'Active'
      AND gm.role_category IN ('Subleader', 'Officer')
      AND COALESCE((gm.permissions->>p_permission)::boolean, false)
  ));
$$;

REVOKE ALL ON FUNCTION guild_has_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guild_has_permission(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS "Users can read guild applications they own or lead" ON guild_applications;
CREATE POLICY "Users can read guild applications they own or manage"
  ON guild_applications FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR guild_has_permission(guild_id, 'acceptApplications', auth.uid()::text)
  );

CREATE OR REPLACE FUNCTION guild_transfer_leadership_internal(p_guild_id uuid, p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target guild_memberships%ROWTYPE;
BEGIN
  SELECT * INTO v_target
  FROM guild_memberships
  WHERE id = p_membership_id
    AND guild_id = p_guild_id
    AND membership_status = 'Active'
    AND role_category <> 'Leader'
    AND character_id IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE guild_memberships
  SET role = 'officer',
      role_category = 'Subleader',
      role_title = 'Former Guild Leader',
      permissions = '{"kickMembers":false,"setMessageBoard":false,"acceptApplications":false,"customizeGuild":false}'::jsonb
  WHERE guild_id = p_guild_id AND role_category = 'Leader';

  UPDATE guild_memberships
  SET role = 'leader',
      role_category = 'Leader',
      role_title = 'Guild Leader',
      permissions = '{"kickMembers":true,"setMessageBoard":true,"acceptApplications":true,"customizeGuild":true}'::jsonb
  WHERE id = p_membership_id;

  UPDATE guilds
  SET leader_id = v_target.user_id,
      leader_character_id = v_target.character_id,
      auto_leader_awaiting_checkin = false,
      next_leader_character_id = NULL,
      leadership_changed_at = now(),
      updated_at = now()
  WHERE id = p_guild_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION guild_refresh_succession_internal(p_guild_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guild guilds%ROWTYPE;
  v_candidate_id uuid;
  v_leader_last_checkin timestamptz;
  v_due boolean;
BEGIN
  SELECT * INTO v_guild FROM guilds WHERE id = p_guild_id FOR UPDATE;
  IF NOT FOUND OR NOT v_guild.auto_leader_enabled THEN RETURN; END IF;

  SELECT max(gc.created_at) INTO v_leader_last_checkin
  FROM guild_checkins gc
  WHERE gc.guild_id = p_guild_id AND gc.character_id = v_guild.leader_character_id;

  v_due := GREATEST(
    v_leader_last_checkin,
    v_guild.auto_leader_enabled_at,
    v_guild.leadership_changed_at,
    v_guild.created_at
  ) < now() - interval '1 month';

  SELECT gm.id INTO v_candidate_id
  FROM guild_memberships gm
  JOIN LATERAL (
    SELECT count(*) AS checkin_count, max(gc.created_at) AS last_checkin
    FROM guild_checkins gc
    WHERE gc.guild_id = p_guild_id
      AND gc.character_id = gm.character_id
      AND gc.created_at >= now() - interval '1 month'
  ) activity ON activity.last_checkin IS NOT NULL
  WHERE gm.guild_id = p_guild_id
    AND gm.membership_status = 'Active'
    AND gm.role_category <> 'Leader'
    AND gm.character_id IS NOT NULL
  ORDER BY CASE gm.role_category
      WHEN 'Subleader' THEN 1 WHEN 'Officer' THEN 2 WHEN 'Member' THEN 3 ELSE 4
    END,
    activity.checkin_count DESC,
    activity.last_checkin DESC,
    gm.joined_at ASC
  LIMIT 1;

  IF v_due THEN
    IF v_candidate_id IS NOT NULL THEN
      PERFORM guild_transfer_leadership_internal(p_guild_id, v_candidate_id);
      PERFORM guild_refresh_succession_internal(p_guild_id);
    ELSE
      UPDATE guilds
      SET auto_leader_awaiting_checkin = true,
          next_leader_character_id = NULL,
          updated_at = now()
      WHERE id = p_guild_id;
    END IF;
  ELSE
    UPDATE guilds g
    SET auto_leader_awaiting_checkin = false,
        next_leader_character_id = (
          SELECT gm.character_id FROM guild_memberships gm WHERE gm.id = v_candidate_id
        ),
        updated_at = now()
    WHERE g.id = p_guild_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION guild_transfer_leadership_internal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION guild_refresh_succession_internal(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION guild_refresh_member_count_internal(p_guild_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_active_core_count integer;
BEGIN
  SELECT count(*) INTO v_active_core_count
  FROM guild_memberships
  WHERE guild_id = p_guild_id
    AND membership_status = 'Active'
    AND role_category IN ('Leader','Subleader','Officer','Member');

  UPDATE guilds
  SET member_count = v_active_core_count,
      status = CASE
        WHEN status = 'Inactive' THEN status
        WHEN v_active_core_count >= COALESCE(founding_required, 3) + 1 THEN 'Active'
        ELSE 'Recruiting'
      END,
      founded_at = CASE
        WHEN v_active_core_count >= COALESCE(founding_required, 3) + 1 THEN COALESCE(founded_at, now())
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_guild_id;
END;
$$;

REVOKE ALL ON FUNCTION guild_refresh_member_count_internal(uuid) FROM PUBLIC;

DO $delegated_customization$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('update_guild_profile_command(uuid,jsonb)'::regprocedure) INTO v_definition;
  v_definition := replace(
    v_definition,
    'IF NOT EXISTS (SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text) THEN',
    'IF NOT guild_has_permission(p_guild_id, ''customizeGuild'', auth.uid()::text) THEN'
  );
  IF position('guild_has_permission(p_guild_id, ''customizeGuild''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not extend guild profile customization permissions';
  END IF;
  EXECUTE v_definition;
END;
$delegated_customization$;

CREATE OR REPLACE FUNCTION update_guild_profile_v3_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb := p_profile;
  v_current_board text;
BEGIN
  IF auth.uid() IS NULL OR NOT guild_has_permission(p_guild_id, 'customizeGuild', auth.uid()::text) THEN
    RAISE EXCEPTION 'You do not have permission to customize this guild';
  END IF;

  -- Appearance editors cannot smuggle a message-board update through the
  -- broader profile payload unless that privilege was assigned separately.
  IF NOT guild_has_permission(p_guild_id, 'setMessageBoard', auth.uid()::text) THEN
    SELECT message_board_html INTO v_current_board FROM guilds WHERE id = p_guild_id;
    v_profile := jsonb_set(
      v_profile,
      '{messageBoardHtml}',
      to_jsonb(COALESCE(v_current_board, '')),
      true
    );
  END IF;

  RETURN update_guild_profile_v2_command(p_guild_id, v_profile);
END;
$$;

REVOKE ALL ON FUNCTION update_guild_profile_command(uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION update_guild_profile_v2_command(uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION update_guild_profile_v3_command(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_profile_v3_command(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION update_guild_member_management_command(
  p_guild_id uuid,
  p_membership_id uuid,
  p_role_category text,
  p_role_title text,
  p_permissions jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text
  ) THEN RAISE EXCEPTION 'Only the guildmaster can assign ranks and privileges'; END IF;

  IF p_role_category NOT IN ('Subleader', 'Officer', 'Member', 'Ally')
     OR length(trim(COALESCE(p_role_title, ''))) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid guild rank or title';
  END IF;
  IF jsonb_typeof(p_permissions) <> 'object'
     OR (SELECT count(*) FROM jsonb_each(p_permissions)) <> 4
     OR (SELECT count(*) FROM jsonb_each(p_permissions) WHERE key NOT IN ('kickMembers','setMessageBoard','acceptApplications','customizeGuild')) > 0
     OR (SELECT count(*) FROM jsonb_each(p_permissions) WHERE jsonb_typeof(value) <> 'boolean') > 0 THEN
    RAISE EXCEPTION 'Invalid guild privileges';
  END IF;

  UPDATE guild_memberships
  SET role_category = p_role_category,
      role_title = trim(p_role_title),
      role = CASE WHEN p_role_category IN ('Subleader','Officer') THEN 'officer' ELSE 'member' END,
      permissions = CASE WHEN p_role_category IN ('Subleader','Officer') THEN p_permissions
        ELSE '{"kickMembers":false,"setMessageBoard":false,"acceptApplications":false,"customizeGuild":false}'::jsonb END
  WHERE id = p_membership_id AND guild_id = p_guild_id AND role_category <> 'Leader';

  IF FOUND THEN
    PERFORM guild_refresh_member_count_internal(p_guild_id);
    PERFORM guild_refresh_succession_internal(p_guild_id);
  END IF;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION kick_guild_member_command(p_guild_id uuid, p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target guild_memberships%ROWTYPE;
  v_actor_rank integer;
  v_target_rank integer;
BEGIN
  IF auth.uid() IS NULL OR NOT guild_has_permission(p_guild_id, 'kickMembers', auth.uid()::text) THEN
    RAISE EXCEPTION 'You do not have permission to remove guild members';
  END IF;
  SELECT * INTO v_target FROM guild_memberships
  WHERE id = p_membership_id AND guild_id = p_guild_id AND membership_status = 'Active';
  IF NOT FOUND OR v_target.role_category = 'Leader' THEN RAISE EXCEPTION 'That member cannot be removed'; END IF;

  SELECT min(CASE gm.role_category WHEN 'Subleader' THEN 2 WHEN 'Officer' THEN 3 WHEN 'Member' THEN 4 ELSE 5 END)
  INTO v_actor_rank FROM guild_memberships gm
  WHERE gm.guild_id = p_guild_id AND gm.user_id = auth.uid()::text AND gm.membership_status = 'Active';
  IF EXISTS (SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text) THEN v_actor_rank := 1; END IF;
  v_target_rank := CASE v_target.role_category WHEN 'Subleader' THEN 2 WHEN 'Officer' THEN 3 WHEN 'Member' THEN 4 ELSE 5 END;
  IF v_actor_rank IS NULL OR v_actor_rank >= v_target_rank THEN RAISE EXCEPTION 'You cannot remove a member of equal or higher rank'; END IF;

  DELETE FROM guild_memberships WHERE id = p_membership_id;
  IF v_target.character_id IS NOT NULL THEN
    UPDATE characters SET guild_id = NULL, updated_at = now()
    WHERE id = v_target.character_id AND guild_id = p_guild_id;
  END IF;
  PERFORM guild_refresh_member_count_internal(p_guild_id);
  PERFORM guild_refresh_succession_internal(p_guild_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION decide_guild_application_command(p_guild_id uuid, p_application_id uuid, p_decision text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application guild_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT guild_has_permission(p_guild_id, 'acceptApplications', auth.uid()::text) THEN
    RAISE EXCEPTION 'You do not have permission to decide guild applications';
  END IF;
  IF p_decision NOT IN ('accept','reject') THEN RAISE EXCEPTION 'Invalid application decision'; END IF;
  SELECT * INTO v_application FROM guild_applications
  WHERE id = p_application_id AND guild_id = p_guild_id AND status = 'Pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  IF p_decision = 'reject' THEN
    UPDATE guild_applications SET status = 'Rejected', updated_at = now() WHERE id = p_application_id;
    RETURN true;
  END IF;
  IF v_application.character_id IS NULL THEN RAISE EXCEPTION 'Application has no character'; END IF;
  IF v_application.requested_role_category <> 'Ally' AND EXISTS (
    SELECT 1 FROM guild_memberships WHERE character_id = v_application.character_id
      AND membership_status = 'Active' AND role_category IN ('Leader','Subleader','Officer','Member')
  ) THEN RAISE EXCEPTION 'That character already has a core guild membership'; END IF;

  INSERT INTO guild_memberships (
    guild_id,user_id,character_id,role,role_category,role_title,membership_status,invited_by,joined_at,accepted_at,badges,contributions
  ) VALUES (
    p_guild_id,v_application.user_id,v_application.character_id,
    CASE WHEN v_application.requested_role_category = 'Officer' THEN 'officer' ELSE 'member' END,
    v_application.requested_role_category,v_application.requested_role_category,'Active',auth.uid()::text,now(),now(),'{}',0
  );
  UPDATE guild_applications SET status = 'Accepted', updated_at = now() WHERE id = p_application_id;
  IF v_application.requested_role_category <> 'Ally' THEN
    UPDATE characters SET guild_id = p_guild_id, updated_at = now() WHERE id = v_application.character_id;
  END IF;
  PERFORM guild_refresh_member_count_internal(p_guild_id);
  PERFORM guild_refresh_succession_internal(p_guild_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION set_guild_auto_leader_command(p_guild_id uuid, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text) THEN
    RAISE EXCEPTION 'Only the guildmaster can change automatic leadership';
  END IF;
  UPDATE guilds SET auto_leader_enabled = p_enabled,
    auto_leader_enabled_at = CASE WHEN p_enabled THEN now() ELSE NULL END,
    auto_leader_awaiting_checkin = false,
    next_leader_character_id = NULL,
    updated_at = now()
  WHERE id = p_guild_id;
  IF p_enabled THEN PERFORM guild_refresh_succession_internal(p_guild_id); END IF;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_guild_succession_command(p_guild_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM guilds WHERE id = p_guild_id) THEN RETURN false; END IF;
  PERFORM guild_refresh_succession_internal(p_guild_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION transfer_guild_leader_command(p_guild_id uuid, p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_transferred boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text) THEN
    RAISE EXCEPTION 'Only the guildmaster can transfer leadership';
  END IF;
  v_transferred := guild_transfer_leadership_internal(p_guild_id, p_membership_id);
  IF NOT v_transferred THEN RAISE EXCEPTION 'Choose an active guild member'; END IF;
  PERFORM guild_refresh_succession_internal(p_guild_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION update_guild_message_board_command(p_guild_id uuid, p_message_board_html text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_html text := trim(COALESCE(p_message_board_html,''));
BEGIN
  IF auth.uid() IS NULL OR NOT guild_has_permission(p_guild_id, 'setMessageBoard', auth.uid()::text) THEN
    RAISE EXCEPTION 'You do not have permission to update the message board';
  END IF;
  IF length(v_html) > 12000
     OR v_html ~* '<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|video|audio|canvas|link|meta|base)'
     OR v_html ~* '\son[a-z]+\s*='
     OR v_html ~* '(href|src)\s*=\s*["'']?\s*(javascript|vbscript|data):' THEN
    RAISE EXCEPTION 'Message board content is invalid';
  END IF;
  UPDATE guilds SET message_board_html = v_html, message_board_updated_at = now(), updated_at = now()
  WHERE id = p_guild_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION check_in_guild_character_command(p_guild_id uuid, p_character_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inserted integer := 0; v_influence integer := 0; v_waiting boolean := false; v_membership_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT gm.id INTO v_membership_id FROM guild_memberships gm JOIN characters c ON c.id = gm.character_id
  WHERE gm.guild_id = p_guild_id AND gm.character_id = p_character_id
    AND gm.user_id = auth.uid()::text AND c.user_id = auth.uid()::text AND gm.membership_status = 'Active';
  IF v_membership_id IS NULL THEN RAISE EXCEPTION 'Only an active guild character can check in'; END IF;

  INSERT INTO guild_checkins (guild_id,character_id,user_id,checkin_date,influence_awarded)
  VALUES (p_guild_id,p_character_id,auth.uid()::text,(now() AT TIME ZONE 'UTC')::date,1)
  ON CONFLICT (character_id,checkin_date) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    UPDATE guilds SET influence_points = influence_points + 1, updated_at = now()
    WHERE id = p_guild_id RETURNING influence_points, auto_leader_awaiting_checkin INTO v_influence, v_waiting;
    IF v_waiting AND NOT EXISTS (SELECT 1 FROM guilds WHERE id=p_guild_id AND leader_character_id=p_character_id) THEN
      PERFORM guild_transfer_leadership_internal(p_guild_id, v_membership_id);
    END IF;
    PERFORM guild_refresh_succession_internal(p_guild_id);
  ELSE
    SELECT influence_points INTO v_influence FROM guilds WHERE id = p_guild_id;
  END IF;
  RETURN jsonb_build_object('awarded',v_inserted=1,'influencePoints',COALESCE(v_influence,0),'checkinDate',((now() AT TIME ZONE 'UTC')::date)::text);
END;
$$;

REVOKE ALL ON FUNCTION update_guild_member_management_command(uuid,uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION kick_guild_member_command(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION decide_guild_application_command(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_guild_auto_leader_command(uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION refresh_guild_succession_command(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION transfer_guild_leader_command(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_guild_message_board_command(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_member_management_command(uuid,uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION kick_guild_member_command(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION decide_guild_application_command(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_guild_auto_leader_command(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_guild_succession_command(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_guild_leader_command(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_guild_message_board_command(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_in_guild_character_command(uuid,uuid) TO authenticated;
