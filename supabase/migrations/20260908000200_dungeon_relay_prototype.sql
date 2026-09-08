/*
  # Dungeon Relay multiplayer prototype

  Server-authoritative cooperative card matching for 2-8 players. Player hands
  and decks have no client read policy; the snapshot RPC reveals only the
  caller's hand while played cards and aggregate counts are shared publicly.
*/

CREATE TABLE public.dungeon_relay_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.multiplayer_teams(id) ON DELETE CASCADE,
  leader_id text NOT NULL REFERENCES public.users(auth_user_id) ON DELETE RESTRICT,
  random_seed uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost')),
  phase text NOT NULL DEFAULT 'active' CHECK (phase IN ('active', 'resolving', 'complete')),
  dungeon_position integer NOT NULL DEFAULT 1 CHECK (dungeon_position BETWEEN 1 AND 11),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  resolve_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dungeon_relay_one_active_team_match_idx
  ON public.dungeon_relay_matches (team_id)
  WHERE status = 'active';

CREATE TABLE public.dungeon_relay_players (
  match_id uuid NOT NULL REFERENCES public.dungeon_relay_matches(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  seat smallint NOT NULL CHECK (seat BETWEEN 1 AND 8),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dead')),
  died_at timestamptz,
  PRIMARY KEY (match_id, user_id),
  UNIQUE (match_id, seat)
);

CREATE TABLE public.dungeon_relay_cards (
  id uuid PRIMARY KEY,
  match_id uuid NOT NULL,
  user_id text NOT NULL,
  symbol text NOT NULL CHECK (symbol IN ('sword', 'arrow', 'shield', 'staff', 'dagger')),
  symbol_count smallint NOT NULL CHECK (symbol_count BETWEEN 1 AND 3),
  zone text NOT NULL DEFAULT 'deck' CHECK (zone IN ('deck', 'hand', 'played', 'discard')),
  draw_order smallint NOT NULL CHECK (draw_order BETWEEN 1 AND 50),
  played_round smallint,
  played_sequence bigint,
  FOREIGN KEY (match_id, user_id)
    REFERENCES public.dungeon_relay_players(match_id, user_id) ON DELETE CASCADE,
  UNIQUE (match_id, user_id, draw_order)
);

CREATE INDEX dungeon_relay_cards_zone_idx
  ON public.dungeon_relay_cards (match_id, user_id, zone, draw_order);
CREATE INDEX dungeon_relay_cards_played_idx
  ON public.dungeon_relay_cards (match_id, played_round, played_sequence)
  WHERE zone = 'played';

CREATE TABLE public.dungeon_relay_dungeons (
  match_id uuid NOT NULL REFERENCES public.dungeon_relay_matches(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 11),
  requirements jsonb NOT NULL,
  PRIMARY KEY (match_id, position),
  CONSTRAINT dungeon_relay_requirements_object CHECK (jsonb_typeof(requirements) = 'object')
);

CREATE TABLE public.dungeon_relay_updates (
  match_id uuid PRIMARY KEY REFERENCES public.dungeon_relay_matches(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dungeon_relay_events (
  match_id uuid NOT NULL REFERENCES public.dungeon_relay_matches(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 0),
  actor_id text REFERENCES public.users(auth_user_id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('match_started', 'cards_played', 'round_advanced')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, sequence)
);

ALTER TABLE public.dungeon_relay_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dungeon_relay_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dungeon_relay_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dungeon_relay_dungeons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dungeon_relay_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dungeon_relay_updates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_dungeon_relay_participant(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dungeon_relay_players
    WHERE match_id = p_match_id AND user_id = auth.uid()::text
  );
$$;

REVOKE ALL ON FUNCTION public.is_dungeon_relay_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dungeon_relay_participant(uuid) TO authenticated;

CREATE POLICY "Participants receive safe Dungeon Relay revision signals"
  ON public.dungeon_relay_updates FOR SELECT TO authenticated
  USING (public.is_dungeon_relay_participant(match_id));
-- Canonical matches, players, cards, dungeons, events, and the random seed have
-- no direct client SELECT or write policy. Private snapshots are the only view.

CREATE OR REPLACE FUNCTION public.dungeon_relay_draw_to_five(p_match_id uuid, p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hand_size integer;
  needed integer;
  deck_size integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.dungeon_relay_players
    WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'active'
  ) THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO hand_size FROM public.dungeon_relay_cards
  WHERE match_id = p_match_id AND user_id = p_user_id AND zone = 'hand';
  needed := 5 - hand_size;
  IF needed <= 0 THEN RETURN true; END IF;

  SELECT count(*) INTO deck_size FROM public.dungeon_relay_cards
  WHERE match_id = p_match_id AND user_id = p_user_id AND zone = 'deck';

  IF deck_size < needed THEN
    UPDATE public.dungeon_relay_players
    SET status = 'dead', died_at = now()
    WHERE match_id = p_match_id AND user_id = p_user_id;
    UPDATE public.dungeon_relay_cards
    SET zone = 'discard'
    WHERE match_id = p_match_id AND user_id = p_user_id AND zone IN ('deck', 'hand');
    RETURN false;
  END IF;

  UPDATE public.dungeon_relay_cards card
  SET zone = 'hand'
  WHERE card.id IN (
    SELECT deck_card.id FROM public.dungeon_relay_cards deck_card
    WHERE deck_card.match_id = p_match_id
      AND deck_card.user_id = p_user_id
      AND deck_card.zone = 'deck'
    ORDER BY deck_card.draw_order
    LIMIT needed
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.dungeon_relay_draw_to_five(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.start_dungeon_relay_match()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id text := auth.uid()::text;
  actor_team_id uuid;
  team_player_count integer;
  new_match_id uuid;
  new_seed uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT team.id INTO actor_team_id
  FROM public.multiplayer_teams team
  WHERE team.leader_id = actor_id
    AND EXISTS (
      SELECT 1 FROM public.multiplayer_team_members member
      WHERE member.team_id = team.id AND member.user_id = actor_id
    )
  FOR UPDATE;

  IF actor_team_id IS NULL THEN RAISE EXCEPTION 'team_leader_required'; END IF;

  SELECT existing_match.id INTO new_match_id FROM public.dungeon_relay_matches existing_match
  WHERE team_id = actor_team_id AND status = 'active';
  IF new_match_id IS NOT NULL THEN RETURN new_match_id; END IF;

  SELECT count(*) INTO team_player_count
  FROM public.multiplayer_team_members WHERE team_id = actor_team_id;
  IF team_player_count < 2 THEN RAISE EXCEPTION 'at_least_two_players'; END IF;
  IF team_player_count > 8 THEN RAISE EXCEPTION 'too_many_players'; END IF;

  UPDATE public.multiplayer_team_invitations
  SET status = 'cancelled', responded_at = now()
  WHERE team_id = actor_team_id AND status = 'pending';

  INSERT INTO public.dungeon_relay_matches (team_id, leader_id)
  VALUES (actor_team_id, actor_id)
  RETURNING id, random_seed INTO new_match_id, new_seed;

  INSERT INTO public.dungeon_relay_players (match_id, user_id, seat)
  SELECT new_match_id, member.user_id,
    row_number() OVER (ORDER BY member.joined_at, member.user_id)::smallint
  FROM public.multiplayer_team_members member
  WHERE member.team_id = actor_team_id;

  INSERT INTO public.dungeon_relay_updates (match_id) VALUES (new_match_id);

  WITH card_templates AS (
    SELECT player.user_id, symbol.name AS symbol, card_copy.number AS copy_number,
      CASE WHEN card_copy.number <= 7 THEN 1 WHEN card_copy.number <= 9 THEN 2 ELSE 3 END AS symbol_count,
      md5(new_seed::text || ':' || player.user_id || ':' || symbol.name || ':' || card_copy.number::text) AS card_hash
    FROM public.dungeon_relay_players player
    CROSS JOIN (VALUES ('sword'), ('arrow'), ('shield'), ('staff'), ('dagger')) AS symbol(name)
    CROSS JOIN generate_series(1, 10) AS card_copy(number)
    WHERE player.match_id = new_match_id
  ), ordered_cards AS (
    SELECT *, row_number() OVER (PARTITION BY user_id ORDER BY card_hash)::smallint AS draw_order
    FROM card_templates
  )
  INSERT INTO public.dungeon_relay_cards (id, match_id, user_id, symbol, symbol_count, draw_order)
  SELECT (
    substr(card_hash, 1, 8) || '-' || substr(card_hash, 9, 4) || '-' ||
    substr(card_hash, 13, 4) || '-' || substr(card_hash, 17, 4) || '-' || substr(card_hash, 21, 12)
  )::uuid, new_match_id, user_id, symbol, symbol_count, draw_order
  FROM ordered_cards;

  UPDATE public.dungeon_relay_cards
  SET zone = 'hand'
  WHERE dungeon_relay_cards.match_id = new_match_id AND draw_order <= 5;

  WITH positions AS (
    SELECT position,
      CASE WHEN position = 11 THEN greatest(10, team_player_count * 3)
        ELSE team_player_count * 2 + ((position - 1) / 4) END AS symbol_total
    FROM generate_series(1, 11) AS position
  ), tokens AS (
    SELECT position.position, token,
      CASE
        WHEN position.position = 11 AND token <= 10 THEN (token - 1) % 5
        ELSE get_byte(decode(substr(md5(new_seed::text || ':' || position.position::text || ':' || token::text), 1, 2), 'hex'), 0) % 5
      END AS symbol_index
    FROM positions position
    CROSS JOIN LATERAL generate_series(1, position.symbol_total) AS token
  )
  INSERT INTO public.dungeon_relay_dungeons (match_id, position, requirements)
  SELECT new_match_id, position, jsonb_build_object(
    'sword', count(*) FILTER (WHERE symbol_index = 0),
    'arrow', count(*) FILTER (WHERE symbol_index = 1),
    'shield', count(*) FILTER (WHERE symbol_index = 2),
    'staff', count(*) FILTER (WHERE symbol_index = 3),
    'dagger', count(*) FILTER (WHERE symbol_index = 4)
  )
  FROM tokens
  GROUP BY position
  ORDER BY position;

  INSERT INTO public.dungeon_relay_events (match_id, sequence, actor_id, event_type, payload)
  VALUES (new_match_id, 0, actor_id, 'match_started', jsonb_build_object(
    'randomSeed', new_seed,
    'playerCount', team_player_count,
    'rulesVersion', 'dungeon-relay-prototype-1'
  ));

  RETURN new_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.play_dungeon_relay_cards(p_match_id uuid, p_card_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id text := auth.uid()::text;
  current_match public.dungeon_relay_matches%ROWTYPE;
  requirements jsonb;
  defeated boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  IF p_card_ids IS NULL OR cardinality(p_card_ids) < 1 OR cardinality(p_card_ids) > 5 THEN
    RAISE EXCEPTION 'select_one_to_five_cards';
  END IF;
  IF (SELECT count(DISTINCT card_id) FROM unnest(p_card_ids) AS card_id) <> cardinality(p_card_ids) THEN
    RAISE EXCEPTION 'duplicate_card_selection';
  END IF;

  SELECT * INTO current_match FROM public.dungeon_relay_matches
  WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = '42501';
  END IF;
  IF current_match.status <> 'active' OR current_match.phase <> 'active' THEN
    RAISE EXCEPTION 'match_not_accepting_plays';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dungeon_relay_players
    WHERE match_id = p_match_id AND user_id = actor_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'spectators_cannot_play'; END IF;
  IF (SELECT count(*) FROM public.dungeon_relay_cards
      WHERE match_id = p_match_id AND user_id = actor_id AND zone = 'hand' AND id = ANY(p_card_ids))
      <> cardinality(p_card_ids) THEN
    RAISE EXCEPTION 'card_not_in_hand';
  END IF;

  UPDATE public.dungeon_relay_cards card
  SET zone = 'played',
      played_round = current_match.dungeon_position,
      played_sequence = current_match.revision::bigint * 10 + array_position(p_card_ids, card.id)
  WHERE card.match_id = p_match_id AND card.user_id = actor_id AND card.id = ANY(p_card_ids);

  IF NOT EXISTS (
    SELECT 1 FROM public.dungeon_relay_cards
    WHERE match_id = p_match_id AND user_id = actor_id AND zone = 'hand'
  ) THEN
    PERFORM public.dungeon_relay_draw_to_five(p_match_id, actor_id);
  END IF;

  SELECT dungeon.requirements INTO requirements
  FROM public.dungeon_relay_dungeons dungeon
  WHERE dungeon.match_id = p_match_id AND dungeon.position = current_match.dungeon_position;

  SELECT
    COALESCE(sum(symbol_count) FILTER (WHERE symbol = 'sword'), 0) >= (requirements->>'sword')::integer AND
    COALESCE(sum(symbol_count) FILTER (WHERE symbol = 'arrow'), 0) >= (requirements->>'arrow')::integer AND
    COALESCE(sum(symbol_count) FILTER (WHERE symbol = 'shield'), 0) >= (requirements->>'shield')::integer AND
    COALESCE(sum(symbol_count) FILTER (WHERE symbol = 'staff'), 0) >= (requirements->>'staff')::integer AND
    COALESCE(sum(symbol_count) FILTER (WHERE symbol = 'dagger'), 0) >= (requirements->>'dagger')::integer
  INTO defeated
  FROM public.dungeon_relay_cards
  WHERE match_id = p_match_id AND zone = 'played' AND played_round = current_match.dungeon_position;

  IF defeated THEN
    UPDATE public.dungeon_relay_matches
    SET phase = 'resolving', resolve_at = now() + interval '1800 milliseconds', revision = revision + 1
    WHERE id = p_match_id;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.dungeon_relay_players WHERE match_id = p_match_id AND status = 'active'
  ) THEN
    UPDATE public.dungeon_relay_matches
    SET status = 'lost', phase = 'complete', ended_at = now(), revision = revision + 1
    WHERE id = p_match_id;
  ELSE
    UPDATE public.dungeon_relay_matches SET revision = revision + 1 WHERE id = p_match_id;
  END IF;

  INSERT INTO public.dungeon_relay_events (match_id, sequence, actor_id, event_type, payload)
  VALUES (p_match_id, current_match.revision + 1, actor_id, 'cards_played', jsonb_build_object(
    'dungeonPosition', current_match.dungeon_position,
    'cardIds', to_jsonb(p_card_ids),
    'defeated', defeated,
    'deadPlayerIds', COALESCE((SELECT jsonb_agg(user_id) FROM public.dungeon_relay_players WHERE match_id = p_match_id AND status = 'dead'), '[]'::jsonb)
  ));
  UPDATE public.dungeon_relay_updates
  SET revision = current_match.revision + 1, updated_at = now()
  WHERE match_id = p_match_id;

  RETURN defeated;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_dungeon_relay_round(p_match_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_match public.dungeon_relay_matches%ROWTYPE;
  player record;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = '42501';
  END IF;
  IF current_match.phase <> 'resolving' THEN RETURN false; END IF;
  IF current_match.resolve_at IS NOT NULL AND now() < current_match.resolve_at THEN RETURN false; END IF;

  UPDATE public.dungeon_relay_cards
  SET zone = 'discard'
  WHERE match_id = p_match_id AND zone = 'played' AND played_round = current_match.dungeon_position;

  IF current_match.dungeon_position = 11 THEN
    UPDATE public.dungeon_relay_matches
    SET status = 'won', phase = 'complete', resolve_at = NULL, ended_at = now(), revision = revision + 1
    WHERE id = p_match_id;
    INSERT INTO public.dungeon_relay_events (match_id, sequence, actor_id, event_type, payload)
    VALUES (p_match_id, current_match.revision + 1, auth.uid()::text, 'round_advanced', jsonb_build_object(
      'fromPosition', 11, 'toPosition', NULL, 'status', 'won'
    ));
    UPDATE public.dungeon_relay_updates
    SET revision = current_match.revision + 1, updated_at = now()
    WHERE match_id = p_match_id;
    RETURN true;
  END IF;

  FOR player IN
    SELECT user_id FROM public.dungeon_relay_players
    WHERE match_id = p_match_id AND status = 'active' ORDER BY seat
  LOOP
    PERFORM public.dungeon_relay_draw_to_five(p_match_id, player.user_id);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.dungeon_relay_players WHERE match_id = p_match_id AND status = 'active'
  ) THEN
    UPDATE public.dungeon_relay_matches
    SET status = 'lost', phase = 'complete', resolve_at = NULL, ended_at = now(), revision = revision + 1
    WHERE id = p_match_id;
  ELSE
    UPDATE public.dungeon_relay_matches
    SET dungeon_position = dungeon_position + 1, phase = 'active', resolve_at = NULL, revision = revision + 1
    WHERE id = p_match_id;
  END IF;
  INSERT INTO public.dungeon_relay_events (match_id, sequence, actor_id, event_type, payload)
  VALUES (p_match_id, current_match.revision + 1, auth.uid()::text, 'round_advanced', jsonb_build_object(
    'fromPosition', current_match.dungeon_position,
    'toPosition', CASE WHEN EXISTS (SELECT 1 FROM public.dungeon_relay_matches WHERE id = p_match_id AND status = 'active') THEN current_match.dungeon_position + 1 ELSE NULL END,
    'status', (SELECT status FROM public.dungeon_relay_matches WHERE id = p_match_id),
    'deadPlayerIds', COALESCE((SELECT jsonb_agg(user_id) FROM public.dungeon_relay_players WHERE match_id = p_match_id AND status = 'dead'), '[]'::jsonb)
  ));
  UPDATE public.dungeon_relay_updates
  SET revision = current_match.revision + 1, updated_at = now()
  WHERE match_id = p_match_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_dungeon_relay_match()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT match.id
  FROM public.dungeon_relay_matches match
  JOIN public.dungeon_relay_players player ON player.match_id = match.id
  WHERE player.user_id = auth.uid()::text AND match.status = 'active'
  ORDER BY match.started_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_dungeon_relay_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_dungeon_relay_participant(p_match_id) THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'match', jsonb_build_object(
      'id', match.id,
      'teamId', match.team_id,
      'leaderId', match.leader_id,
      'status', match.status,
      'phase', match.phase,
      'dungeonPosition', match.dungeon_position,
      'totalDungeons', 11,
      'revision', match.revision,
      'resolveAt', match.resolve_at
    ),
    'dungeon', jsonb_build_object(
      'position', dungeon.position,
      'isBoss', dungeon.position = 11,
      'name', CASE WHEN dungeon.position = 11 THEN 'The Convergence Warden'
        ELSE 'Dungeon Chamber ' || dungeon.position::text END,
      'requirements', dungeon.requirements
    ),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', player.user_id,
        'username', profile.username,
        'avatar', COALESCE(profile.avatar, ''),
        'color', COALESCE(lobby.color, 'silver'),
        'status', player.status,
        'seat', player.seat,
        'handCount', (SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id = match.id AND card.user_id = player.user_id AND card.zone = 'hand'),
        'deckCount', (SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id = match.id AND card.user_id = player.user_id AND card.zone = 'deck'),
        'discardCount', (SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id = match.id AND card.user_id = player.user_id AND card.zone = 'discard')
      ) ORDER BY player.seat)
      FROM public.dungeon_relay_players player
      JOIN public.users profile ON profile.auth_user_id = player.user_id
      LEFT JOIN public.multiplayer_lobby_players lobby ON lobby.user_id = player.user_id
      WHERE player.match_id = match.id
    ), '[]'::jsonb),
    'self', (
      SELECT jsonb_build_object(
        'userId', player.user_id,
        'status', player.status,
        'hand', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', card.id, 'symbol', card.symbol, 'symbols', card.symbol_count
          ) ORDER BY card.draw_order)
          FROM public.dungeon_relay_cards card
          WHERE card.match_id = match.id AND card.user_id = player.user_id AND card.zone = 'hand'
        ), '[]'::jsonb)
      )
      FROM public.dungeon_relay_players player
      WHERE player.match_id = match.id AND player.user_id = auth.uid()::text
    ),
    'playedCards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', card.id,
        'userId', card.user_id,
        'username', profile.username,
        'color', COALESCE(lobby.color, 'silver'),
        'symbol', card.symbol,
        'symbols', card.symbol_count,
        'playedOrder', card.played_sequence
      ) ORDER BY card.played_sequence, card.id)
      FROM public.dungeon_relay_cards card
      JOIN public.users profile ON profile.auth_user_id = card.user_id
      LEFT JOIN public.multiplayer_lobby_players lobby ON lobby.user_id = card.user_id
      WHERE card.match_id = match.id AND card.zone = 'played' AND card.played_round = match.dungeon_position
    ), '[]'::jsonb)
  ) INTO result
  FROM public.dungeon_relay_matches match
  JOIN public.dungeon_relay_dungeons dungeon
    ON dungeon.match_id = match.id AND dungeon.position = match.dungeon_position
  WHERE match.id = p_match_id;

  IF result IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.start_dungeon_relay_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.play_dungeon_relay_cards(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_dungeon_relay_round(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_dungeon_relay_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dungeon_relay_state(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_dungeon_relay_match() TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_dungeon_relay_cards(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_dungeon_relay_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_dungeon_relay_match() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dungeon_relay_state(uuid) TO authenticated;

ALTER TABLE public.dungeon_relay_updates REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dungeon_relay_updates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dungeon_relay_updates;
  END IF;
END $$;
