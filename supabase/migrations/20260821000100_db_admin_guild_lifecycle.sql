/*
  # Administrative guild lifecycle

  - Replaces the unused Inactive lifecycle state with Disbanded.
  - Makes disbanded guilds immutable historical records.
  - Adds password-protected commands for status and leader changes.
  - Extends the database-admin snapshot with guild status and leader candidates.
*/

ALTER TABLE public.guilds DROP CONSTRAINT IF EXISTS guilds_status_check;
UPDATE public.guilds SET status = 'Disbanded' WHERE status = 'Inactive';
ALTER TABLE public.guilds
  ADD CONSTRAINT guilds_status_check CHECK (status IN ('Active', 'Recruiting', 'Disbanded'));

CREATE OR REPLACE FUNCTION public.protect_disbanded_guild()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.db_admin_guild_write', true) = 'allowed' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'Disbanded' OR NEW.status = 'Disbanded' THEN
    RAISE EXCEPTION 'Disbanded guilds are read-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_disbanded_guild_trigger ON public.guilds;
CREATE TRIGGER protect_disbanded_guild_trigger
  BEFORE UPDATE ON public.guilds
  FOR EACH ROW EXECUTE FUNCTION public.protect_disbanded_guild();

CREATE OR REPLACE FUNCTION public.protect_disbanded_guild_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  target_guild_id uuid;
BEGIN
  IF current_setting('app.db_admin_guild_write', true) = 'allowed' OR pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  target_guild_id := COALESCE(NEW.guild_id, OLD.guild_id);
  IF EXISTS (SELECT 1 FROM public.guilds WHERE id = target_guild_id AND status = 'Disbanded') THEN
    RAISE EXCEPTION 'Disbanded guilds are read-only';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'guild_memberships', 'guild_applications', 'guild_checkins', 'guild_guestbook_entries'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS protect_disbanded_guild_record_trigger ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER protect_disbanded_guild_record_trigger BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.protect_disbanded_guild_record()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Guild leaders can delete their guilds" ON public.guilds;
CREATE POLICY "Guild leaders can delete their guilds"
  ON public.guilds FOR DELETE TO authenticated
  USING (leader_id = auth.uid()::text AND status <> 'Disbanded');

CREATE OR REPLACE FUNCTION public.set_db_admin_guild_status_command(
  p_password text,
  p_guild_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  guild_name text;
BEGIN
  PERFORM public.require_db_admin_password(p_password);
  IF p_status NOT IN ('Active', 'Recruiting', 'Disbanded') THEN
    RAISE EXCEPTION 'Invalid guild status';
  END IF;

  PERFORM set_config('app.db_admin_guild_write', 'allowed', true);
  UPDATE public.guilds
  SET status = p_status,
      recruitment_status = CASE WHEN p_status = 'Disbanded' THEN 'closed' ELSE recruitment_status END,
      auto_leader_enabled = CASE WHEN p_status = 'Disbanded' THEN false ELSE auto_leader_enabled END,
      auto_leader_awaiting_checkin = CASE WHEN p_status = 'Disbanded' THEN false ELSE auto_leader_awaiting_checkin END,
      next_leader_character_id = CASE WHEN p_status = 'Disbanded' THEN NULL ELSE next_leader_character_id END,
      updated_at = now()
  WHERE id = p_guild_id
  RETURNING name INTO guild_name;
  IF guild_name IS NULL THEN RAISE EXCEPTION 'Guild not found'; END IF;

  INSERT INTO public.db_admin_audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid()::text, 'set_status', 'guild', p_guild_id::text,
    jsonb_build_object('name', guild_name, 'status', p_status));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_db_admin_guild_leader_command(
  p_password text,
  p_guild_id uuid,
  p_membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  guild_name text;
  new_leader_name text;
BEGIN
  PERFORM public.require_db_admin_password(p_password);
  SELECT name INTO guild_name FROM public.guilds WHERE id = p_guild_id AND status <> 'Disbanded';
  IF guild_name IS NULL THEN RAISE EXCEPTION 'Active or recruiting guild not found'; END IF;

  SELECT characters.name INTO new_leader_name
  FROM public.guild_memberships
  JOIN public.characters ON characters.id = guild_memberships.character_id
  WHERE guild_memberships.id = p_membership_id
    AND guild_memberships.guild_id = p_guild_id
    AND guild_memberships.membership_status = 'Active'
    AND characters.character_status = 'active';
  IF new_leader_name IS NULL THEN RAISE EXCEPTION 'Eligible guild member not found'; END IF;

  PERFORM set_config('app.db_admin_guild_write', 'allowed', true);
  IF NOT public.guild_transfer_leadership_internal(p_guild_id, p_membership_id) THEN
    RAISE EXCEPTION 'Guild leadership could not be changed';
  END IF;

  INSERT INTO public.db_admin_audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid()::text, 'set_leader', 'guild', p_guild_id::text,
    jsonb_build_object('name', guild_name, 'leader', new_leader_name, 'membershipId', p_membership_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_db_admin_snapshot_command(p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_db_admin_password(p_password);
  RETURN jsonb_build_object(
    'users', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', users.auth_user_id, 'username', users.username, 'email', users.email,
        'avatar', COALESCE(NULLIF(users.avatar, ''), '/npc-placeholder.png'),
        'isAdmin', users.is_admin, 'isLoremaster', users.is_loremaster,
        'isBanned', users.is_banned, 'bannedAt', users.banned_at
      ) ORDER BY users.username), '[]'::jsonb) FROM public.users
    ),
    'characters', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', characters.id, 'name', characters.name, 'className', characters.class,
        'level', COALESCE(characters.level, 1), 'ownerId', characters.user_id,
        'ownerName', COALESCE(users.username, 'Unknown user'), 'status', characters.character_status
      ) ORDER BY characters.name), '[]'::jsonb)
      FROM public.characters LEFT JOIN public.users ON users.auth_user_id = characters.user_id
    ),
    'guilds', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', guilds.id, 'name', guilds.name, 'leaderId', guilds.leader_id,
        'leaderName', COALESCE(users.username, 'Unknown user'),
        'memberCount', COALESCE(guilds.member_count, 0), 'status', guilds.status,
        'leaderCandidates', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'membershipId', membership.id, 'userId', membership.user_id,
            'characterName', character.name, 'userName', COALESCE(member_user.username, 'Unknown user')
          ) ORDER BY character.name)
          FROM public.guild_memberships membership
          JOIN public.characters character ON character.id = membership.character_id
          LEFT JOIN public.users member_user ON member_user.auth_user_id = membership.user_id
          WHERE membership.guild_id = guilds.id
            AND membership.membership_status = 'Active'
            AND membership.role_category <> 'Leader'
            AND character.character_status = 'active'
        ), '[]'::jsonb)
      ) ORDER BY guilds.name), '[]'::jsonb)
      FROM public.guilds LEFT JOIN public.users ON users.auth_user_id = guilds.leader_id
    ),
    'loreEntries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', lore_entries.id, 'title', lore_entries.title,
        'status', lore_entries.status, 'authorName', lore_entries.author_name
      ) ORDER BY lore_entries.title), '[]'::jsonb) FROM public.lore_entries
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_db_admin_guild_status_command(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_db_admin_guild_leader_command(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_db_admin_guild_status_command(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_db_admin_guild_leader_command(text, uuid, uuid) TO anon, authenticated;
