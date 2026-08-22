/*
  # Select guild leaders by character

  The database-admin UI selects a character. The command resolves that
  character's active guild membership and derives the owning user from the
  character record. Active membership is the roster authority; characters.guild_id
  is not reliable for older roster records.
*/

CREATE OR REPLACE FUNCTION public.guild_refresh_member_count_internal(p_guild_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  active_core_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.guilds WHERE id = p_guild_id AND status = 'Disbanded') THEN
    RETURN;
  END IF;

  SELECT count(*)::integer INTO active_core_count
  FROM public.guild_memberships membership
  JOIN public.characters character ON character.id = membership.character_id
  WHERE membership.guild_id = p_guild_id
    AND membership.membership_status = 'Active'
    AND membership.role_category IN ('Leader', 'Subleader', 'Officer', 'Member')
    AND character.character_status = 'active';

  UPDATE public.guilds
  SET member_count = active_core_count,
      status = CASE
        WHEN active_core_count >= COALESCE(founding_required, 3) + 1 THEN 'Active'
        ELSE 'Recruiting'
      END,
      founded_at = CASE
        WHEN active_core_count >= COALESCE(founding_required, 3) + 1 THEN COALESCE(founded_at, now())
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_guild_id;
END;
$$;

SELECT set_config('app.db_admin_guild_write', 'allowed', true);
UPDATE public.guilds guild
SET member_count = roster.member_count
FROM (
  SELECT guilds.id,
    count(membership.id) FILTER (
      WHERE membership.membership_status = 'Active'
        AND membership.role_category IN ('Leader', 'Subleader', 'Officer', 'Member')
        AND character.character_status = 'active'
    )::integer AS member_count
  FROM public.guilds
  LEFT JOIN public.guild_memberships membership ON membership.guild_id = guilds.id
  LEFT JOIN public.characters character ON character.id = membership.character_id
  GROUP BY guilds.id
) roster
WHERE guild.id = roster.id;
SELECT set_config('app.db_admin_guild_write', '', true);

CREATE OR REPLACE FUNCTION public.set_db_admin_guild_leader_by_character_command(
  p_password text,
  p_guild_id uuid,
  p_character_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  guild_name text;
  target_membership_id uuid;
  target_user_id text;
  new_leader_name text;
BEGIN
  PERFORM public.require_db_admin_password(p_password);
  SELECT name INTO guild_name
  FROM public.guilds
  WHERE id = p_guild_id AND status <> 'Disbanded';
  IF guild_name IS NULL THEN RAISE EXCEPTION 'Active or recruiting guild not found'; END IF;

  SELECT membership.id, character.user_id, character.name
  INTO target_membership_id, target_user_id, new_leader_name
  FROM public.characters character
  JOIN public.guild_memberships membership ON membership.character_id = character.id
  WHERE character.id = p_character_id
    AND character.character_status = 'active'
    AND membership.guild_id = p_guild_id
    AND membership.membership_status = 'Active'
    AND membership.role_category IN ('Subleader', 'Officer', 'Member')
  ORDER BY membership.joined_at
  LIMIT 1;
  IF target_membership_id IS NULL THEN RAISE EXCEPTION 'Eligible guild character not found'; END IF;

  PERFORM set_config('app.db_admin_guild_write', 'allowed', true);

  -- Membership ownership follows the selected character before the existing
  -- transfer routine derives the guild's leader_id from that membership.
  UPDATE public.guild_memberships
  SET user_id = target_user_id
  WHERE id = target_membership_id;

  IF NOT public.guild_transfer_leadership_internal(p_guild_id, target_membership_id) THEN
    RAISE EXCEPTION 'Guild leadership could not be changed';
  END IF;

  INSERT INTO public.db_admin_audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid()::text, 'set_leader', 'guild', p_guild_id::text,
    jsonb_build_object(
      'name', guild_name,
      'leaderCharacterId', p_character_id,
      'leaderCharacterName', new_leader_name,
      'leaderUserId', target_user_id
    ));
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
        'leaderName', COALESCE(users.username, 'Unknown user'), 'status', guilds.status,
        'memberCount', (
          SELECT count(*)::integer
          FROM public.guild_memberships membership
          JOIN public.characters character ON character.id = membership.character_id
          WHERE membership.guild_id = guilds.id
            AND membership.membership_status = 'Active'
            AND membership.role_category IN ('Leader', 'Subleader', 'Officer', 'Member')
            AND character.character_status = 'active'
        ),
        'leaderCandidates', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'characterId', candidate.character_id,
            'userId', candidate.user_id,
            'characterName', candidate.character_name,
            'userName', candidate.user_name
          ) ORDER BY candidate.character_name)
          FROM (
            SELECT DISTINCT ON (character.id)
              character.id AS character_id,
              character.user_id,
              character.name AS character_name,
              COALESCE(member_user.username, 'Unknown user') AS user_name
            FROM public.guild_memberships membership
            JOIN public.characters character ON character.id = membership.character_id
            LEFT JOIN public.users member_user ON member_user.auth_user_id = character.user_id
            WHERE membership.guild_id = guilds.id
              AND membership.membership_status = 'Active'
              AND membership.role_category IN ('Subleader', 'Officer', 'Member')
              AND character.character_status = 'active'
            ORDER BY character.id, membership.joined_at
          ) candidate
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

REVOKE ALL ON FUNCTION public.set_db_admin_guild_leader_by_character_command(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_db_admin_guild_leader_by_character_command(text, uuid, uuid) TO anon, authenticated;
