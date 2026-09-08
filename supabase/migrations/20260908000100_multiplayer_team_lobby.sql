/*
  # Multiplayer team lobby

  Authenticated players can enter a lightweight matchmaking lobby, wait for an
  invitation, or create a team of up to eight players. All writes go through
  security-definer functions so team capacity and invitation state remain
  authoritative on the server.
*/

CREATE TABLE public.multiplayer_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id text NOT NULL REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.multiplayer_lobby_players (
  user_id text PRIMARY KEY REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('waiting', 'solo', 'team')),
  color text NOT NULL CHECK (color IN ('crimson', 'amber', 'emerald', 'cyan', 'azure', 'violet', 'rose', 'silver')),
  team_id uuid REFERENCES public.multiplayer_teams(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplayer_lobby_mode_team_check CHECK (
    (mode = 'team' AND team_id IS NOT NULL) OR (mode <> 'team' AND team_id IS NULL)
  )
);

CREATE TABLE public.multiplayer_team_members (
  team_id uuid NOT NULL REFERENCES public.multiplayer_teams(id) ON DELETE CASCADE,
  user_id text NOT NULL UNIQUE REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE public.multiplayer_team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.multiplayer_teams(id) ON DELETE CASCADE,
  inviter_id text NOT NULL REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  invitee_id text NOT NULL REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT multiplayer_invitation_distinct_players CHECK (inviter_id <> invitee_id)
);

CREATE UNIQUE INDEX multiplayer_pending_team_invitation_idx
  ON public.multiplayer_team_invitations (team_id, invitee_id)
  WHERE status = 'pending';
CREATE INDEX multiplayer_lobby_presence_idx
  ON public.multiplayer_lobby_players (mode, last_seen_at DESC);
CREATE INDEX multiplayer_invitation_invitee_idx
  ON public.multiplayer_team_invitations (invitee_id, status, created_at DESC);
CREATE INDEX multiplayer_invitation_inviter_idx
  ON public.multiplayer_team_invitations (inviter_id, status, created_at DESC);

ALTER TABLE public.multiplayer_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_lobby_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lobby players are visible to lobby players"
  ON public.multiplayer_lobby_players FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Team members can read their team"
  ON public.multiplayer_teams FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.multiplayer_lobby_players viewer
    WHERE viewer.team_id = multiplayer_teams.id AND viewer.user_id = auth.uid()::text
  ));

CREATE POLICY "Team members can read teammates"
  ON public.multiplayer_team_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.multiplayer_lobby_players viewer
    WHERE viewer.team_id = multiplayer_team_members.team_id AND viewer.user_id = auth.uid()::text
  ));

CREATE POLICY "Players can read related invitations"
  ON public.multiplayer_team_invitations FOR SELECT TO authenticated
  USING (invitee_id = auth.uid()::text OR inviter_id = auth.uid()::text OR EXISTS (
    SELECT 1 FROM public.multiplayer_lobby_players viewer
    WHERE viewer.team_id = multiplayer_team_invitations.team_id AND viewer.user_id = auth.uid()::text
  ));

CREATE OR REPLACE FUNCTION public.multiplayer_leave_team(actor_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_team_id uuid;
  next_leader_id text;
BEGIN
  SELECT team_id INTO actor_team_id
  FROM public.multiplayer_team_members
  WHERE user_id = actor_id
  FOR UPDATE;

  IF actor_team_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.multiplayer_team_members
  WHERE team_id = actor_team_id AND user_id = actor_id;

  UPDATE public.multiplayer_team_invitations
  SET status = 'cancelled', responded_at = now()
  WHERE team_id = actor_team_id AND status = 'pending' AND inviter_id = actor_id;

  SELECT user_id INTO next_leader_id
  FROM public.multiplayer_team_members
  WHERE team_id = actor_team_id
  ORDER BY joined_at, user_id
  LIMIT 1;

  IF next_leader_id IS NULL THEN
    DELETE FROM public.multiplayer_teams WHERE id = actor_team_id;
  ELSIF EXISTS (
    SELECT 1 FROM public.multiplayer_teams
    WHERE id = actor_team_id AND leader_id = actor_id
  ) THEN
    UPDATE public.multiplayer_teams
    SET leader_id = next_leader_id, updated_at = now()
    WHERE id = actor_team_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.multiplayer_leave_team(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enter_multiplayer_lobby(p_mode text, p_color text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id text := auth.uid()::text;
  new_team_id uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('waiting', 'solo', 'team') THEN
    RAISE EXCEPTION 'invalid_lobby_mode';
  END IF;
  IF p_color NOT IN ('crimson', 'amber', 'emerald', 'cyan', 'azure', 'violet', 'rose', 'silver') THEN
    RAISE EXCEPTION 'invalid_player_color';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = actor_id) THEN
    RAISE EXCEPTION 'profile_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(actor_id));

  IF p_mode = 'team' THEN
    SELECT team_id INTO new_team_id
    FROM public.multiplayer_team_members
    WHERE user_id = actor_id;

    IF new_team_id IS NULL THEN
      INSERT INTO public.multiplayer_teams (leader_id)
      VALUES (actor_id)
      RETURNING id INTO new_team_id;

      INSERT INTO public.multiplayer_team_members (team_id, user_id)
      VALUES (new_team_id, actor_id);
    END IF;
  ELSE
    UPDATE public.multiplayer_lobby_players
    SET mode = p_mode, color = p_color, team_id = NULL, last_seen_at = now(), updated_at = now()
    WHERE user_id = actor_id;
    PERFORM public.multiplayer_leave_team(actor_id);
  END IF;

  INSERT INTO public.multiplayer_lobby_players (user_id, mode, color, team_id)
  VALUES (actor_id, p_mode, p_color, new_team_id)
  ON CONFLICT (user_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    color = EXCLUDED.color,
    team_id = EXCLUDED.team_id,
    last_seen_at = now(),
    updated_at = now();

  IF p_mode <> 'waiting' THEN
    UPDATE public.multiplayer_team_invitations
    SET status = 'cancelled', responded_at = now()
    WHERE invitee_id = actor_id AND status = 'pending';
  END IF;

  RETURN jsonb_build_object('mode', p_mode, 'teamId', new_team_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_multiplayer_player_color(p_color text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_color NOT IN ('crimson', 'amber', 'emerald', 'cyan', 'azure', 'violet', 'rose', 'silver') THEN
    RAISE EXCEPTION 'invalid_player_color';
  END IF;

  UPDATE public.multiplayer_lobby_players
  SET color = p_color, last_seen_at = now(), updated_at = now()
  WHERE user_id = auth.uid()::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_in_lobby';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_multiplayer_team_player(p_invitee_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id text := auth.uid()::text;
  actor_team_id uuid;
  invitation_id uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT team_id INTO actor_team_id
  FROM public.multiplayer_team_members
  WHERE user_id = actor_id;

  IF actor_team_id IS NULL THEN
    RAISE EXCEPTION 'not_on_team';
  END IF;

  PERFORM 1 FROM public.multiplayer_teams WHERE id = actor_team_id FOR UPDATE;

  IF (SELECT count(*) FROM public.multiplayer_team_members WHERE team_id = actor_team_id) >= 8 THEN
    RAISE EXCEPTION 'team_full';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.multiplayer_lobby_players
    WHERE user_id = p_invitee_id
      AND mode = 'waiting'
      AND last_seen_at > now() - interval '90 seconds'
  ) THEN
    RAISE EXCEPTION 'player_not_waiting';
  END IF;

  INSERT INTO public.multiplayer_team_invitations (team_id, inviter_id, invitee_id)
  VALUES (actor_team_id, actor_id, p_invitee_id)
  ON CONFLICT (team_id, invitee_id) WHERE status = 'pending'
  DO UPDATE SET inviter_id = EXCLUDED.inviter_id, created_at = now()
  RETURNING id INTO invitation_id;

  RETURN invitation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_multiplayer_team_invitation(p_invitation_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id text := auth.uid()::text;
  invitation public.multiplayer_team_invitations%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO invitation
  FROM public.multiplayer_team_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND OR invitation.invitee_id <> actor_id THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = '42501';
  END IF;
  IF invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation_already_resolved';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.multiplayer_team_invitations
    SET status = 'declined', responded_at = now()
    WHERE id = p_invitation_id;
    RETURN;
  END IF;

  PERFORM 1 FROM public.multiplayer_teams WHERE id = invitation.team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_not_found';
  END IF;
  IF (SELECT count(*) FROM public.multiplayer_team_members WHERE team_id = invitation.team_id) >= 8 THEN
    RAISE EXCEPTION 'team_full';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.multiplayer_lobby_players
    WHERE user_id = actor_id AND mode = 'waiting'
  ) THEN
    RAISE EXCEPTION 'player_not_waiting';
  END IF;

  INSERT INTO public.multiplayer_team_members (team_id, user_id)
  VALUES (invitation.team_id, actor_id);

  UPDATE public.multiplayer_lobby_players
  SET mode = 'team', team_id = invitation.team_id, last_seen_at = now(), updated_at = now()
  WHERE user_id = actor_id;

  UPDATE public.multiplayer_team_invitations
  SET status = CASE WHEN id = p_invitation_id THEN 'accepted' ELSE 'cancelled' END,
      responded_at = now()
  WHERE invitee_id = actor_id AND status = 'pending';

  IF (SELECT count(*) FROM public.multiplayer_team_members WHERE team_id = invitation.team_id) >= 8 THEN
    UPDATE public.multiplayer_team_invitations
    SET status = 'cancelled', responded_at = now()
    WHERE team_id = invitation.team_id AND status = 'pending';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_multiplayer_lobby()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actor_id text := auth.uid()::text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(actor_id));
  DELETE FROM public.multiplayer_lobby_players WHERE user_id = actor_id;
  PERFORM public.multiplayer_leave_team(actor_id);
  UPDATE public.multiplayer_team_invitations
  SET status = 'cancelled', responded_at = now()
  WHERE status = 'pending' AND (invitee_id = actor_id OR inviter_id = actor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_multiplayer_lobby()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.multiplayer_lobby_players
  SET last_seen_at = now()
  WHERE user_id = auth.uid()::text;
$$;

CREATE OR REPLACE FUNCTION public.get_multiplayer_lobby_state()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH actor AS (
    SELECT auth.uid()::text AS id
  ), self_row AS (
    SELECT player.* FROM public.multiplayer_lobby_players player, actor
    WHERE player.user_id = actor.id
  ), actor_team AS (
    SELECT member.team_id FROM public.multiplayer_team_members member, actor
    WHERE member.user_id = actor.id
  )
  SELECT jsonb_build_object(
    'self', (
      SELECT jsonb_build_object(
        'userId', self_row.user_id,
        'mode', self_row.mode,
        'color', self_row.color,
        'teamId', self_row.team_id
      ) FROM self_row
    ),
    'waitingPlayers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', player.user_id,
        'username', profile.username,
        'avatar', COALESCE(profile.avatar, ''),
        'color', player.color
      ) ORDER BY lower(profile.username), player.user_id)
      FROM public.multiplayer_lobby_players player
      JOIN public.users profile ON profile.auth_user_id = player.user_id
      CROSS JOIN actor
      WHERE player.mode = 'waiting'
        AND player.user_id <> actor.id
        AND player.last_seen_at > now() - interval '90 seconds'
    ), '[]'::jsonb),
    'team', (
      SELECT jsonb_build_object(
        'id', team.id,
        'leaderId', team.leader_id,
        'members', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'userId', member.user_id,
            'username', profile.username,
            'avatar', COALESCE(profile.avatar, ''),
            'color', player.color,
            'joinedAt', member.joined_at
          ) ORDER BY member.joined_at, member.user_id)
          FROM public.multiplayer_team_members member
          JOIN public.users profile ON profile.auth_user_id = member.user_id
          JOIN public.multiplayer_lobby_players player ON player.user_id = member.user_id
          WHERE member.team_id = team.id
        ), '[]'::jsonb)
      )
      FROM public.multiplayer_teams team
      WHERE team.id = (SELECT team_id FROM actor_team)
    ),
    'incomingInvitations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', invitation.id,
        'teamId', invitation.team_id,
        'inviterId', invitation.inviter_id,
        'inviterName', inviter.username,
        'inviterAvatar', COALESCE(inviter.avatar, ''),
        'status', invitation.status,
        'createdAt', invitation.created_at
      ) ORDER BY invitation.created_at DESC)
      FROM public.multiplayer_team_invitations invitation
      JOIN public.users inviter ON inviter.auth_user_id = invitation.inviter_id
      CROSS JOIN actor
      WHERE invitation.invitee_id = actor.id AND invitation.status = 'pending'
    ), '[]'::jsonb),
    'pendingInviteeIds', COALESCE((
      SELECT jsonb_agg(DISTINCT invitation.invitee_id)
      FROM public.multiplayer_team_invitations invitation
      WHERE invitation.team_id = (SELECT team_id FROM actor_team)
        AND invitation.status = 'pending'
    ), '[]'::jsonb),
    'recentInvitationUpdates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', invitation.id,
        'inviteeId', invitation.invitee_id,
        'inviteeName', invitee.username,
        'status', invitation.status,
        'respondedAt', invitation.responded_at
      ) ORDER BY invitation.responded_at DESC)
      FROM public.multiplayer_team_invitations invitation
      JOIN public.users invitee ON invitee.auth_user_id = invitation.invitee_id
      CROSS JOIN actor
      WHERE invitation.inviter_id = actor.id
        AND invitation.status IN ('accepted', 'declined')
        AND invitation.responded_at > now() - interval '2 minutes'
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.enter_multiplayer_lobby(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_multiplayer_player_color(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_multiplayer_team_player(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_multiplayer_team_invitation(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_multiplayer_lobby() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_multiplayer_lobby() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_multiplayer_lobby_state() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enter_multiplayer_lobby(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_multiplayer_player_color(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_multiplayer_team_player(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_multiplayer_team_invitation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_multiplayer_lobby() TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_multiplayer_lobby() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_multiplayer_lobby_state() TO authenticated;

ALTER TABLE public.multiplayer_teams REPLICA IDENTITY FULL;
ALTER TABLE public.multiplayer_lobby_players REPLICA IDENTITY FULL;
ALTER TABLE public.multiplayer_team_members REPLICA IDENTITY FULL;
ALTER TABLE public.multiplayer_team_invitations REPLICA IDENTITY FULL;

DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'multiplayer_teams',
    'multiplayer_lobby_players',
    'multiplayer_team_members',
    'multiplayer_team_invitations'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.site_pages DROP CONSTRAINT IF EXISTS site_pages_known_page_key;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_known_page_key CHECK (
  page_key IN (
    'home', 'about', 'lore', 'characters', 'citizens', 'guilds', 'schedule', 'games',
    'marketplace', 'arcana', 'underhaul-contracts', 'arcane-locks', 'broken-seals',
    'citadel-tactics', 'tactical-puzzles', 'campaign-objectives', 'multiplayer-lobby',
    'event', 'skill-checks', 'news'
  )
);

INSERT INTO public.site_pages (page_key, is_enabled)
VALUES ('multiplayer-lobby', true)
ON CONFLICT (page_key) DO NOTHING;
