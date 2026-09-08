/* Dungeon Relay card types, mini-bosses, and consensual event resolution. */

ALTER TABLE public.dungeon_relay_dungeons
  ADD COLUMN card_type text NOT NULL DEFAULT 'obstacle',
  ADD COLUMN event_type text,
  ADD COLUMN event_stage text,
  ADD COLUMN selected_target_id text;

ALTER TABLE public.dungeon_relay_dungeons
  ADD CONSTRAINT dungeon_relay_card_type_check CHECK (card_type IN ('obstacle','person','beast','hazard','mini_boss','boss','event')),
  ADD CONSTRAINT dungeon_relay_event_type_check CHECK (event_type IS NULL OR event_type IN ('discard_shields','give_hands','pass_left','discard_multis')),
  ADD CONSTRAINT dungeon_relay_event_stage_check CHECK (event_stage IS NULL OR event_stage IN ('voting','confirming','completed')),
  ADD CONSTRAINT dungeon_relay_event_shape_check CHECK (
    (card_type = 'event' AND event_type IS NOT NULL AND event_stage IS NOT NULL)
    OR (card_type <> 'event' AND event_type IS NULL AND event_stage IS NULL AND selected_target_id IS NULL)
  );
ALTER TABLE public.dungeon_relay_dungeons
  ADD CONSTRAINT dungeon_relay_selected_target_fkey FOREIGN KEY (match_id, selected_target_id)
  REFERENCES public.dungeon_relay_players(match_id, user_id);

ALTER TABLE public.dungeon_relay_cards ADD COLUMN holder_id text;
UPDATE public.dungeon_relay_cards SET holder_id = user_id;
ALTER TABLE public.dungeon_relay_cards ALTER COLUMN holder_id SET NOT NULL;
ALTER TABLE public.dungeon_relay_cards
  ADD CONSTRAINT dungeon_relay_card_holder_fkey FOREIGN KEY (match_id, holder_id)
  REFERENCES public.dungeon_relay_players(match_id, user_id) ON DELETE CASCADE;
ALTER TABLE public.dungeon_relay_cards DROP CONSTRAINT IF EXISTS dungeon_relay_cards_zone_check;
ALTER TABLE public.dungeon_relay_cards ADD CONSTRAINT dungeon_relay_cards_zone_check
  CHECK (zone IN ('deck','hand','played','event_discard','discard'));
CREATE INDEX dungeon_relay_cards_holder_zone_idx
  ON public.dungeon_relay_cards(match_id, holder_id, zone, draw_order);

CREATE OR REPLACE FUNCTION public.set_dungeon_relay_card_holder()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.holder_id := COALESCE(NEW.holder_id, NEW.user_id);
  RETURN NEW;
END $$;
CREATE TRIGGER set_dungeon_relay_card_holder_trigger
BEFORE INSERT ON public.dungeon_relay_cards
FOR EACH ROW EXECUTE FUNCTION public.set_dungeon_relay_card_holder();

CREATE TABLE public.dungeon_relay_event_votes (
  match_id uuid NOT NULL,
  dungeon_position smallint NOT NULL,
  voter_id text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, dungeon_position, voter_id),
  FOREIGN KEY (match_id, voter_id) REFERENCES public.dungeon_relay_players(match_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (match_id, target_id) REFERENCES public.dungeon_relay_players(match_id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.dungeon_relay_event_confirmations (
  match_id uuid NOT NULL,
  dungeon_position smallint NOT NULL,
  user_id text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, dungeon_position, user_id),
  FOREIGN KEY (match_id, user_id) REFERENCES public.dungeon_relay_players(match_id, user_id) ON DELETE CASCADE
);

ALTER TABLE public.dungeon_relay_event_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dungeon_relay_event_confirmations ENABLE ROW LEVEL SECURITY;
-- Votes and confirmations are exposed only through the player-specific snapshot.

CREATE OR REPLACE FUNCTION public.configure_dungeon_relay_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  seed uuid;
  choice integer;
  event_choice integer;
  total_symbols integer;
BEGIN
  SELECT random_seed INTO seed FROM public.dungeon_relay_matches WHERE id = NEW.match_id;

  IF NEW.position = 11 THEN
    NEW.card_type := 'boss';
    NEW.event_type := NULL; NEW.event_stage := NULL; NEW.selected_target_id := NULL;
    NEW.requirements := jsonb_build_object('sword',3,'arrow',3,'shield',3,'staff',3,'dagger',3);
    RETURN NEW;
  END IF;

  IF NEW.position IN (5, 10) THEN
    choice := get_byte(decode(substr(md5(seed::text || ':special:' || NEW.position::text), 1, 2), 'hex'), 0) % 2;
    IF choice = 0 THEN
      NEW.card_type := 'mini_boss';
      NEW.event_type := NULL; NEW.event_stage := NULL; NEW.selected_target_id := NULL;
      WITH tokens AS (
        SELECT get_byte(decode(substr(md5(seed::text || ':mini:' || NEW.position::text || ':' || token::text), 1, 2), 'hex'), 0) % 5 AS symbol_index
        FROM generate_series(1, 5) token
      )
      SELECT jsonb_build_object(
        'sword',count(*) FILTER (WHERE symbol_index=0),'arrow',count(*) FILTER (WHERE symbol_index=1),
        'shield',count(*) FILTER (WHERE symbol_index=2),'staff',count(*) FILTER (WHERE symbol_index=3),
        'dagger',count(*) FILTER (WHERE symbol_index=4)
      ) INTO NEW.requirements FROM tokens;
    ELSE
      event_choice := get_byte(decode(substr(md5(seed::text || ':event:' || NEW.position::text), 1, 2), 'hex'), 0) % 4;
      NEW.card_type := 'event';
      NEW.event_type := (ARRAY['discard_shields','give_hands','pass_left','discard_multis'])[event_choice + 1];
      NEW.event_stage := CASE WHEN NEW.event_type = 'give_hands' THEN 'voting' ELSE 'confirming' END;
      NEW.selected_target_id := NULL;
      NEW.requirements := jsonb_build_object('sword',0,'arrow',0,'shield',0,'staff',0,'dagger',0);
    END IF;
    RETURN NEW;
  END IF;

  choice := get_byte(decode(substr(md5(seed::text || ':type:' || NEW.position::text), 1, 2), 'hex'), 0) % 4;
  NEW.card_type := (ARRAY['obstacle','person','beast','hazard'])[choice + 1];
  NEW.event_type := NULL; NEW.event_stage := NULL; NEW.selected_target_id := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS configure_dungeon_relay_card_trigger ON public.dungeon_relay_dungeons;
CREATE TRIGGER configure_dungeon_relay_card_trigger
BEFORE INSERT OR UPDATE OF requirements ON public.dungeon_relay_dungeons
FOR EACH ROW EXECUTE FUNCTION public.configure_dungeon_relay_card();

-- Bring any currently active prototype run onto the new card definitions.
UPDATE public.dungeon_relay_dungeons dungeon
SET requirements = dungeon.requirements
FROM public.dungeon_relay_matches match
WHERE match.id = dungeon.match_id AND match.status = 'active';

CREATE OR REPLACE FUNCTION public.dungeon_relay_draw_to_five(p_match_id uuid, p_user_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE hand_size integer; needed integer; deck_size integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=p_user_id AND status='active') THEN RETURN false; END IF;
  SELECT count(*) INTO hand_size FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=p_user_id AND zone='hand';
  needed := 5-hand_size; IF needed<=0 THEN RETURN true; END IF;
  SELECT count(*) INTO deck_size FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND user_id=p_user_id AND zone='deck';
  IF deck_size<needed THEN
    UPDATE public.dungeon_relay_players SET status='dead',died_at=now() WHERE match_id=p_match_id AND user_id=p_user_id;
    UPDATE public.dungeon_relay_cards SET zone='discard'
      WHERE match_id=p_match_id AND ((holder_id=p_user_id AND zone='hand') OR (user_id=p_user_id AND zone='deck'));
    RETURN false;
  END IF;
  UPDATE public.dungeon_relay_cards card SET zone='hand',holder_id=p_user_id WHERE card.id IN (
    SELECT id FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND user_id=p_user_id AND zone='deck' ORDER BY draw_order LIMIT needed
  );
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.play_dungeon_relay_cards(p_match_id uuid,p_card_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id text:=auth.uid()::text; current_match public.dungeon_relay_matches%ROWTYPE; dungeon public.dungeon_relay_dungeons%ROWTYPE; defeated boolean:=false;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF p_card_ids IS NULL OR cardinality(p_card_ids)<1 OR cardinality(p_card_ids)>5 THEN RAISE EXCEPTION 'select_one_to_five_cards'; END IF;
  IF (SELECT count(DISTINCT card_id) FROM unnest(p_card_ids) AS selected(card_id))<>cardinality(p_card_ids) THEN RAISE EXCEPTION 'duplicate_card_selection'; END IF;
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  IF current_match.status<>'active' OR current_match.phase<>'active' THEN RAISE EXCEPTION 'match_not_accepting_plays'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=actor_id AND status='active') THEN RAISE EXCEPTION 'spectators_cannot_play'; END IF;
  SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  IF dungeon.card_type='event' AND EXISTS (SELECT 1 FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=actor_id) THEN RAISE EXCEPTION 'event_already_confirmed'; END IF;
  IF (SELECT count(*) FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND id=ANY(p_card_ids))<>cardinality(p_card_ids) THEN RAISE EXCEPTION 'card_not_in_hand'; END IF;
  UPDATE public.dungeon_relay_cards card SET zone='played',played_round=current_match.dungeon_position,
    played_sequence=current_match.revision::bigint*100+array_position(p_card_ids,card.id)
    WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND id=ANY(p_card_ids);
  IF NOT EXISTS (SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand') THEN PERFORM public.dungeon_relay_draw_to_five(p_match_id,actor_id); END IF;
  IF dungeon.event_type='give_hands' AND dungeon.selected_target_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=dungeon.selected_target_id AND status='active'
  ) THEN
    UPDATE public.dungeon_relay_dungeons SET event_stage='voting',selected_target_id=NULL WHERE match_id=p_match_id AND position=current_match.dungeon_position;
    DELETE FROM public.dungeon_relay_event_votes WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
    DELETE FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
  END IF;
  IF dungeon.card_type<>'event' THEN
    SELECT COALESCE(sum(symbol_count) FILTER(WHERE symbol='sword'),0)>=(dungeon.requirements->>'sword')::int
      AND COALESCE(sum(symbol_count) FILTER(WHERE symbol='arrow'),0)>=(dungeon.requirements->>'arrow')::int
      AND COALESCE(sum(symbol_count) FILTER(WHERE symbol='shield'),0)>=(dungeon.requirements->>'shield')::int
      AND COALESCE(sum(symbol_count) FILTER(WHERE symbol='staff'),0)>=(dungeon.requirements->>'staff')::int
      AND COALESCE(sum(symbol_count) FILTER(WHERE symbol='dagger'),0)>=(dungeon.requirements->>'dagger')::int INTO defeated
      FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND zone='played' AND played_round=current_match.dungeon_position;
  END IF;
  IF defeated THEN UPDATE public.dungeon_relay_matches SET phase='resolving',resolve_at=now()+interval '1800 milliseconds',revision=revision+1 WHERE id=p_match_id;
  ELSIF NOT EXISTS (SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active') THEN UPDATE public.dungeon_relay_matches SET status='lost',phase='complete',ended_at=now(),revision=revision+1 WHERE id=p_match_id;
  ELSE UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id; END IF;
  INSERT INTO public.dungeon_relay_events(match_id,sequence,actor_id,event_type,payload) VALUES(p_match_id,current_match.revision+1,actor_id,'cards_played',jsonb_build_object('dungeonPosition',current_match.dungeon_position,'cardIds',to_jsonb(p_card_ids),'defeated',defeated));
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
  RETURN defeated;
END $$;

CREATE OR REPLACE FUNCTION public.vote_dungeon_relay_event_target(p_match_id uuid,p_target_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id text:=auth.uid()::text; current_match public.dungeon_relay_matches%ROWTYPE; active_count integer; vote_count integer; winner text;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  IF current_match.status<>'active' OR current_match.phase<>'active' OR NOT EXISTS(SELECT 1 FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position AND card_type='event' AND event_type='give_hands' AND event_stage='voting') THEN RAISE EXCEPTION 'event_not_voting'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=actor_id AND status='active') OR NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=p_target_id AND status='active') THEN RAISE EXCEPTION 'active_player_required'; END IF;
  INSERT INTO public.dungeon_relay_event_votes(match_id,dungeon_position,voter_id,target_id) VALUES(p_match_id,current_match.dungeon_position,actor_id,p_target_id)
    ON CONFLICT(match_id,dungeon_position,voter_id) DO UPDATE SET target_id=excluded.target_id,updated_at=now();
  DELETE FROM public.dungeon_relay_event_votes vote WHERE vote.match_id=p_match_id AND vote.dungeon_position=current_match.dungeon_position AND (
    NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players player WHERE player.match_id=p_match_id AND player.user_id=vote.voter_id AND player.status='active')
    OR NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players player WHERE player.match_id=p_match_id AND player.user_id=vote.target_id AND player.status='active')
  );
  SELECT count(*) INTO active_count FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active';
  SELECT count(*) INTO vote_count FROM public.dungeon_relay_event_votes WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
  IF vote_count=active_count THEN
    SELECT vote.target_id INTO winner FROM public.dungeon_relay_event_votes vote JOIN public.dungeon_relay_players target ON target.match_id=vote.match_id AND target.user_id=vote.target_id
      WHERE vote.match_id=p_match_id AND vote.dungeon_position=current_match.dungeon_position GROUP BY vote.target_id,target.seat ORDER BY count(*) DESC,target.seat LIMIT 1;
    UPDATE public.dungeon_relay_dungeons SET selected_target_id=winner,event_stage='confirming' WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  END IF;
  UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id;
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
END $$;

CREATE OR REPLACE FUNCTION public.discard_dungeon_relay_event_cards(p_match_id uuid,p_card_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id text:=auth.uid()::text; current_match public.dungeon_relay_matches%ROWTYPE; dungeon public.dungeon_relay_dungeons%ROWTYPE;
BEGIN
  IF p_card_ids IS NULL OR cardinality(p_card_ids)<1 THEN RAISE EXCEPTION 'select_event_cards'; END IF;
  IF (SELECT count(DISTINCT card_id) FROM unnest(p_card_ids) AS selected(card_id))<>cardinality(p_card_ids) THEN RAISE EXCEPTION 'duplicate_card_selection'; END IF;
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  IF current_match.phase<>'active' OR dungeon.card_type<>'event' OR dungeon.event_type NOT IN('discard_shields','discard_multis') THEN RAISE EXCEPTION 'event_does_not_discard'; END IF;
  IF EXISTS(SELECT 1 FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=actor_id) THEN RAISE EXCEPTION 'event_already_confirmed'; END IF;
  IF (SELECT count(*) FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND id=ANY(p_card_ids)
    AND ((dungeon.event_type='discard_shields' AND symbol='shield') OR (dungeon.event_type='discard_multis' AND symbol_count>1)))<>cardinality(p_card_ids) THEN RAISE EXCEPTION 'card_not_event_eligible'; END IF;
  UPDATE public.dungeon_relay_cards SET zone='event_discard',played_round=current_match.dungeon_position WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND id=ANY(p_card_ids);
  UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id;
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_dungeon_relay_event(p_match_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id text:=auth.uid()::text; current_match public.dungeon_relay_matches%ROWTYPE; dungeon public.dungeon_relay_dungeons%ROWTYPE; active_count integer; confirm_count integer;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  IF current_match.phase<>'active' OR dungeon.card_type<>'event' OR dungeon.event_stage<>'confirming' THEN RAISE EXCEPTION 'event_not_confirming'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=actor_id AND status='active') THEN RAISE EXCEPTION 'active_player_required'; END IF;
  IF dungeon.event_type='discard_shields' AND EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND symbol='shield') THEN RAISE EXCEPTION 'eligible_cards_remain'; END IF;
  IF dungeon.event_type='discard_multis' AND EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND symbol_count>1) THEN RAISE EXCEPTION 'eligible_cards_remain'; END IF;
  INSERT INTO public.dungeon_relay_event_confirmations(match_id,dungeon_position,user_id) VALUES(p_match_id,current_match.dungeon_position,actor_id) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO active_count FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active';
  SELECT count(*) INTO confirm_count FROM public.dungeon_relay_event_confirmations confirmation JOIN public.dungeon_relay_players player ON player.match_id=confirmation.match_id AND player.user_id=confirmation.user_id AND player.status='active' WHERE confirmation.match_id=p_match_id AND confirmation.dungeon_position=current_match.dungeon_position;
  IF confirm_count=active_count THEN
    IF dungeon.event_type='give_hands' THEN
      UPDATE public.dungeon_relay_cards SET holder_id=dungeon.selected_target_id WHERE match_id=p_match_id AND zone='hand';
    ELSIF dungeon.event_type='pass_left' THEN
      WITH ordered_players AS (
        SELECT user_id,lead(user_id) OVER(ORDER BY seat) AS following_user,first_value(user_id) OVER(ORDER BY seat) AS first_user
        FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active'
      ), rotation AS (
        SELECT user_id,COALESCE(following_user,first_user) AS next_user FROM ordered_players
      )
      UPDATE public.dungeon_relay_cards card SET holder_id=rotation.next_user FROM rotation WHERE card.match_id=p_match_id AND card.zone='hand' AND card.holder_id=rotation.user_id;
    END IF;
    UPDATE public.dungeon_relay_dungeons SET event_stage='completed' WHERE match_id=p_match_id AND position=current_match.dungeon_position;
    UPDATE public.dungeon_relay_matches SET phase='resolving',resolve_at=now()+interval '1800 milliseconds',revision=revision+1 WHERE id=p_match_id;
  ELSE UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id; END IF;
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
  RETURN confirm_count=active_count;
END $$;

CREATE OR REPLACE FUNCTION public.advance_dungeon_relay_round(p_match_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_match public.dungeon_relay_matches%ROWTYPE; player record; next_position integer; next_dungeon public.dungeon_relay_dungeons%ROWTYPE;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  IF current_match.phase<>'resolving' THEN RETURN false; END IF;
  IF current_match.resolve_at IS NOT NULL AND now()<current_match.resolve_at THEN RETURN false; END IF;
  UPDATE public.dungeon_relay_cards SET zone='discard' WHERE match_id=p_match_id AND zone IN('played','event_discard') AND played_round=current_match.dungeon_position;
  IF current_match.dungeon_position=11 THEN
    UPDATE public.dungeon_relay_matches SET status='won',phase='complete',resolve_at=NULL,ended_at=now(),revision=revision+1 WHERE id=p_match_id;
  ELSE
    FOR player IN SELECT user_id FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active' ORDER BY seat LOOP PERFORM public.dungeon_relay_draw_to_five(p_match_id,player.user_id); END LOOP;
    IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active') THEN UPDATE public.dungeon_relay_matches SET status='lost',phase='complete',resolve_at=NULL,ended_at=now(),revision=revision+1 WHERE id=p_match_id;
    ELSE
      next_position:=current_match.dungeon_position+1;
      LOOP
        SELECT * INTO next_dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=next_position;
        EXIT WHEN next_dungeon.card_type<>'event' OR next_dungeon.event_type NOT IN('discard_shields','discard_multis') OR EXISTS(
          SELECT 1 FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players active ON active.match_id=card.match_id AND active.user_id=card.holder_id AND active.status='active'
          WHERE card.match_id=p_match_id AND card.zone='hand' AND ((next_dungeon.event_type='discard_shields' AND card.symbol='shield') OR (next_dungeon.event_type='discard_multis' AND card.symbol_count>1))
        );
        UPDATE public.dungeon_relay_dungeons SET event_stage='completed' WHERE match_id=p_match_id AND position=next_position;
        next_position:=next_position+1;
      END LOOP;
      UPDATE public.dungeon_relay_matches SET dungeon_position=next_position,phase='active',resolve_at=NULL,revision=revision+1 WHERE id=p_match_id;
    END IF;
  END IF;
  INSERT INTO public.dungeon_relay_events(match_id,sequence,actor_id,event_type,payload) VALUES(p_match_id,current_match.revision+1,auth.uid()::text,'round_advanced',jsonb_build_object('fromPosition',current_match.dungeon_position,'toPosition',(SELECT dungeon_position FROM public.dungeon_relay_matches WHERE id=p_match_id),'status',(SELECT status FROM public.dungeon_relay_matches WHERE id=p_match_id)));
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.get_dungeon_relay_state(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'match',jsonb_build_object('id',match.id,'teamId',match.team_id,'leaderId',match.leader_id,'status',match.status,'phase',match.phase,'dungeonPosition',match.dungeon_position,'totalDungeons',11,'revision',match.revision,'resolveAt',match.resolve_at),
    'dungeon',jsonb_build_object('position',dungeon.position,'isBoss',dungeon.card_type='boss','name',CASE dungeon.card_type WHEN 'boss' THEN 'The Convergence Warden' WHEN 'mini_boss' THEN 'Dungeon Lieutenant' WHEN 'event' THEN CASE dungeon.event_type WHEN 'discard_shields' THEN 'Shields Must Fall' WHEN 'give_hands' THEN 'Choose the Champion' WHEN 'pass_left' THEN 'Arcane Exchange' ELSE 'Travel Light' END ELSE 'Dungeon Chamber '||dungeon.position::text END,'cardType',dungeon.card_type,'eventType',dungeon.event_type,'eventStage',dungeon.event_stage,'selectedTargetId',dungeon.selected_target_id,'requirements',dungeon.requirements),
    'players',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',player.user_id,'username',profile.username,'avatar',COALESCE(profile.avatar,''),'color',COALESCE(lobby.color,'silver'),'status',player.status,'seat',player.seat,'handCount',(SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='hand'),'deckCount',(SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.user_id=player.user_id AND card.zone='deck'),'discardCount',(SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.user_id=player.user_id AND card.zone='discard'),'voteTargetId',(SELECT target_id FROM public.dungeon_relay_event_votes WHERE match_id=match.id AND dungeon_position=match.dungeon_position AND voter_id=player.user_id),'confirmed',EXISTS(SELECT 1 FROM public.dungeon_relay_event_confirmations WHERE match_id=match.id AND dungeon_position=match.dungeon_position AND user_id=player.user_id)) ORDER BY player.seat) FROM public.dungeon_relay_players player JOIN public.users profile ON profile.auth_user_id=player.user_id LEFT JOIN public.multiplayer_lobby_players lobby ON lobby.user_id=player.user_id WHERE player.match_id=match.id),'[]'::jsonb),
    'self',(SELECT jsonb_build_object('userId',player.user_id,'status',player.status,'hand',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'symbol',card.symbol,'symbols',card.symbol_count) ORDER BY card.draw_order) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='hand'),'[]'::jsonb)) FROM public.dungeon_relay_players player WHERE player.match_id=match.id AND player.user_id=auth.uid()::text),
    'playedCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',card.holder_id,'username',profile.username,'color',COALESCE(lobby.color,'silver'),'symbol',card.symbol,'symbols',card.symbol_count,'playedOrder',card.played_sequence) ORDER BY card.played_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.users profile ON profile.auth_user_id=card.holder_id LEFT JOIN public.multiplayer_lobby_players lobby ON lobby.user_id=card.holder_id WHERE card.match_id=match.id AND card.zone='played' AND card.played_round=match.dungeon_position),'[]'::jsonb),
    'eventDiscardCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',card.holder_id,'username',profile.username,'color',COALESCE(lobby.color,'silver'),'symbol',card.symbol,'symbols',card.symbol_count,'playedOrder',0) ORDER BY profile.username,card.draw_order) FROM public.dungeon_relay_cards card JOIN public.users profile ON profile.auth_user_id=card.holder_id LEFT JOIN public.multiplayer_lobby_players lobby ON lobby.user_id=card.holder_id WHERE card.match_id=match.id AND card.zone='event_discard' AND card.played_round=match.dungeon_position),'[]'::jsonb)
  ) INTO result FROM public.dungeon_relay_matches match JOIN public.dungeon_relay_dungeons dungeon ON dungeon.match_id=match.id AND dungeon.position=match.dungeon_position WHERE match.id=p_match_id;
  IF result IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF; RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.vote_dungeon_relay_event_target(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.discard_dungeon_relay_event_cards(uuid,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_dungeon_relay_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_dungeon_relay_event_target(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_dungeon_relay_event_cards(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_dungeon_relay_event(uuid) TO authenticated;
