/* Dungeon Relay classes, recoverable discard piles, class powers, and round timer. */

ALTER TABLE public.multiplayer_lobby_players DROP CONSTRAINT IF EXISTS multiplayer_lobby_players_color_check;
UPDATE public.multiplayer_lobby_players SET color='gold' WHERE color='silver';
ALTER TABLE public.multiplayer_lobby_players ADD CONSTRAINT multiplayer_lobby_players_color_check
  CHECK (color IN ('crimson','rose','emerald','mint','violet','lavender','azure','cyan','amber','gold'));

CREATE OR REPLACE FUNCTION public.enter_multiplayer_lobby(p_mode text,p_color text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id text:=auth.uid()::text; new_team_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF p_mode NOT IN('waiting','solo','team') THEN RAISE EXCEPTION 'invalid_lobby_mode'; END IF;
  IF p_color NOT IN('crimson','rose','emerald','mint','violet','lavender','azure','cyan','amber','gold') THEN RAISE EXCEPTION 'invalid_player_color'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE auth_user_id=actor_id) THEN RAISE EXCEPTION 'profile_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(actor_id));
  IF p_mode='team' THEN
    SELECT team_id INTO new_team_id FROM public.multiplayer_team_members WHERE user_id=actor_id;
    IF new_team_id IS NULL THEN
      INSERT INTO public.multiplayer_teams(leader_id) VALUES(actor_id) RETURNING id INTO new_team_id;
      INSERT INTO public.multiplayer_team_members(team_id,user_id) VALUES(new_team_id,actor_id);
    END IF;
  ELSE
    UPDATE public.multiplayer_lobby_players SET mode=p_mode,color=p_color,team_id=NULL,last_seen_at=now(),updated_at=now() WHERE user_id=actor_id;
    PERFORM public.multiplayer_leave_team(actor_id);
  END IF;
  INSERT INTO public.multiplayer_lobby_players(user_id,mode,color,team_id) VALUES(actor_id,p_mode,p_color,new_team_id)
    ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode,color=excluded.color,team_id=excluded.team_id,last_seen_at=now(),updated_at=now();
  IF p_mode<>'waiting' THEN UPDATE public.multiplayer_team_invitations SET status='cancelled',responded_at=now() WHERE invitee_id=actor_id AND status='pending'; END IF;
  RETURN jsonb_build_object('mode',p_mode,'teamId',new_team_id);
END $$;

CREATE OR REPLACE FUNCTION public.set_multiplayer_player_color(p_color text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF p_color NOT IN('crimson','rose','emerald','mint','violet','lavender','azure','cyan','amber','gold') THEN RAISE EXCEPTION 'invalid_player_color'; END IF;
  UPDATE public.multiplayer_lobby_players SET color=p_color,last_seen_at=now(),updated_at=now() WHERE user_id=auth.uid()::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_lobby'; END IF;
END $$;

ALTER TABLE public.dungeon_relay_players ADD COLUMN class_id text;
UPDATE public.dungeon_relay_players player SET class_id=CASE lobby.color
  WHEN 'crimson' THEN 'barbarian' WHEN 'rose' THEN 'swashbuckler'
  WHEN 'emerald' THEN 'ranger' WHEN 'mint' THEN 'alchemist'
  WHEN 'violet' THEN 'rogue' WHEN 'lavender' THEN 'investigator'
  WHEN 'azure' THEN 'wizard' WHEN 'cyan' THEN 'witch'
  WHEN 'amber' THEN 'champion' WHEN 'gold' THEN 'cleric' ELSE 'wizard' END
FROM public.multiplayer_lobby_players lobby WHERE lobby.user_id=player.user_id;
UPDATE public.dungeon_relay_players SET class_id='wizard' WHERE class_id IS NULL;
ALTER TABLE public.dungeon_relay_players ALTER COLUMN class_id SET NOT NULL;
ALTER TABLE public.dungeon_relay_players ADD CONSTRAINT dungeon_relay_player_class_check CHECK (
  class_id IN ('barbarian','swashbuckler','ranger','alchemist','rogue','investigator','wizard','witch','champion','cleric')
);
ALTER TABLE public.dungeon_relay_events DROP CONSTRAINT IF EXISTS dungeon_relay_events_event_type_check;
ALTER TABLE public.dungeon_relay_events ADD CONSTRAINT dungeon_relay_events_event_type_check CHECK (
  event_type IN('match_started','cards_played','round_advanced','class_power')
);

CREATE OR REPLACE FUNCTION public.set_dungeon_relay_player_class()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE selected_color text;
BEGIN
  IF NEW.class_id IS NULL THEN
    SELECT color INTO selected_color FROM public.multiplayer_lobby_players WHERE user_id=NEW.user_id;
    NEW.class_id:=CASE selected_color
      WHEN 'crimson' THEN 'barbarian' WHEN 'rose' THEN 'swashbuckler'
      WHEN 'emerald' THEN 'ranger' WHEN 'mint' THEN 'alchemist'
      WHEN 'violet' THEN 'rogue' WHEN 'lavender' THEN 'investigator'
      WHEN 'azure' THEN 'wizard' WHEN 'cyan' THEN 'witch'
      WHEN 'amber' THEN 'champion' WHEN 'gold' THEN 'cleric' ELSE 'wizard' END;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.dungeon_relay_class_color(p_class text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT CASE p_class
  WHEN 'barbarian' THEN 'crimson' WHEN 'swashbuckler' THEN 'rose'
  WHEN 'ranger' THEN 'emerald' WHEN 'alchemist' THEN 'mint'
  WHEN 'rogue' THEN 'violet' WHEN 'investigator' THEN 'lavender'
  WHEN 'wizard' THEN 'azure' WHEN 'witch' THEN 'cyan'
  WHEN 'champion' THEN 'amber' WHEN 'cleric' THEN 'gold' ELSE 'azure' END $$;

CREATE OR REPLACE FUNCTION public.get_dungeon_relay_state(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'match',jsonb_build_object('id',match.id,'teamId',match.team_id,'leaderId',match.leader_id,'status',match.status,'phase',match.phase,'dungeonPosition',match.dungeon_position,'totalDungeons',11,'revision',match.revision,'resolveAt',match.resolve_at,'timerDeadline',match.timer_deadline,'timerFrozen',match.timer_frozen,'timerRemainingSeconds',match.timer_remaining_seconds),
    'dungeon',jsonb_build_object('position',dungeon.position,'isBoss',dungeon.card_type='boss','name',CASE dungeon.card_type WHEN 'boss' THEN 'The Convergence Warden' WHEN 'mini_boss' THEN 'Dungeon Lieutenant' WHEN 'event' THEN CASE dungeon.event_type WHEN 'discard_shields' THEN 'Shields Must Fall' WHEN 'give_hands' THEN 'Choose the Champion' WHEN 'pass_left' THEN 'Arcane Exchange' ELSE 'Travel Light' END ELSE 'Dungeon Chamber '||dungeon.position::text END,'cardType',dungeon.card_type,'eventType',dungeon.event_type,'eventStage',dungeon.event_stage,'selectedTargetId',dungeon.selected_target_id,'requirements',dungeon.requirements),
    'players',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'userId',player.user_id,'username',profile.username,'avatar',COALESCE(profile.avatar,''),'color',public.dungeon_relay_class_color(player.class_id),'classId',player.class_id,'status',player.status,'seat',player.seat,
      'handCount',(SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='hand'),
      'deckCount',(SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='deck'),
      'discardCount',(SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='discard'),
      'graveyardCount',(SELECT count(*) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='graveyard'),
      'voteTargetId',(SELECT target_id FROM public.dungeon_relay_event_votes WHERE match_id=match.id AND dungeon_position=match.dungeon_position AND voter_id=player.user_id),
      'confirmed',EXISTS(SELECT 1 FROM public.dungeon_relay_event_confirmations WHERE match_id=match.id AND dungeon_position=match.dungeon_position AND user_id=player.user_id),
      'eventExcluded',EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions WHERE match_id=match.id AND dungeon_position=match.dungeon_position AND user_id=player.user_id)
    ) ORDER BY player.seat) FROM public.dungeon_relay_players player JOIN public.users profile ON profile.auth_user_id=player.user_id WHERE player.match_id=match.id),'[]'::jsonb),
    'self',(SELECT jsonb_build_object('userId',player.user_id,'status',player.status,'hand',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'symbol',card.symbol,'symbols',card.symbol_count) ORDER BY card.pile_order,card.id) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='hand'),'[]'::jsonb)) FROM public.dungeon_relay_players player WHERE player.match_id=match.id AND player.user_id=auth.uid()::text),
    'playedCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'playedOrder',card.played_sequence) ORDER BY card.played_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='played' AND card.played_round=match.dungeon_position),'[]'::jsonb),
    'eventDiscardCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'playedOrder',0) ORDER BY card.discarded_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='event_discard' AND card.played_round=match.dungeon_position),'[]'::jsonb),
    'discardCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'playedOrder',COALESCE(card.discarded_sequence,0)) ORDER BY owner.seat,card.discarded_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='discard'),'[]'::jsonb)
  ) INTO result FROM public.dungeon_relay_matches match JOIN public.dungeon_relay_dungeons dungeon ON dungeon.match_id=match.id AND dungeon.position=match.dungeon_position WHERE match.id=p_match_id;
  IF result IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;
  RETURN result;
END $$;
CREATE TRIGGER set_dungeon_relay_player_class_trigger BEFORE INSERT ON public.dungeon_relay_players
FOR EACH ROW EXECUTE FUNCTION public.set_dungeon_relay_player_class();

ALTER TABLE public.dungeon_relay_matches
  ADD COLUMN timer_deadline timestamptz DEFAULT (now()+interval '60 seconds'),
  ADD COLUMN timer_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN timer_remaining_seconds integer NOT NULL DEFAULT 60 CHECK (timer_remaining_seconds BETWEEN 0 AND 60);
UPDATE public.dungeon_relay_matches SET timer_deadline=now()+interval '60 seconds' WHERE status='active' AND phase='active';

ALTER TABLE public.dungeon_relay_cards
  ADD COLUMN pile_order bigint,
  ADD COLUMN discarded_sequence bigint;
UPDATE public.dungeon_relay_cards SET pile_order=draw_order;
UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE zone='discard';
ALTER TABLE public.dungeon_relay_cards DROP CONSTRAINT IF EXISTS dungeon_relay_cards_zone_check;
ALTER TABLE public.dungeon_relay_cards ADD CONSTRAINT dungeon_relay_cards_zone_check
  CHECK (zone IN ('deck','hand','played','event_discard','discard','graveyard'));
CREATE INDEX dungeon_relay_cards_personal_discard_idx ON public.dungeon_relay_cards(match_id,holder_id,discarded_sequence) WHERE zone='discard';

CREATE TABLE public.dungeon_relay_event_exclusions (
  match_id uuid NOT NULL,
  dungeon_position smallint NOT NULL,
  user_id text NOT NULL,
  excluded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(match_id,dungeon_position,user_id),
  FOREIGN KEY(match_id,user_id) REFERENCES public.dungeon_relay_players(match_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(match_id,excluded_by) REFERENCES public.dungeon_relay_players(match_id,user_id) ON DELETE CASCADE
);
ALTER TABLE public.dungeon_relay_event_exclusions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.dungeon_relay_draw_exact(p_match_id uuid,p_user_id text,p_count integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE deck_size integer;
BEGIN
  IF p_count<=0 THEN RETURN true; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=p_user_id AND status='active') THEN RETURN false; END IF;
  SELECT count(*) INTO deck_size FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=p_user_id AND zone='deck';
  IF deck_size<p_count THEN
    UPDATE public.dungeon_relay_players SET status='dead',died_at=now() WHERE match_id=p_match_id AND user_id=p_user_id;
    UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE match_id=p_match_id AND holder_id=p_user_id AND zone IN('deck','hand');
    RETURN false;
  END IF;
  UPDATE public.dungeon_relay_cards card SET zone='hand' WHERE card.id IN(
    SELECT id FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=p_user_id AND zone='deck'
    ORDER BY pile_order,id LIMIT p_count
  );
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.dungeon_relay_draw_exact(uuid,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dungeon_relay_draw_to_five(p_match_id uuid,p_user_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE hand_size integer;
BEGIN
  SELECT count(*) INTO hand_size FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=p_user_id AND zone='hand';
  RETURN public.dungeon_relay_draw_exact(p_match_id,p_user_id,greatest(0,5-hand_size));
END $$;
REVOKE ALL ON FUNCTION public.dungeon_relay_draw_to_five(uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.resume_dungeon_relay_timer_on_play()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.zone='hand' AND NEW.zone='played' THEN
    UPDATE public.dungeon_relay_matches SET
      timer_deadline=now()+make_interval(secs=>timer_remaining_seconds),timer_frozen=false
    WHERE id=NEW.match_id AND timer_frozen;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER resume_dungeon_relay_timer_on_play_trigger AFTER UPDATE OF zone ON public.dungeon_relay_cards
FOR EACH ROW EXECUTE FUNCTION public.resume_dungeon_relay_timer_on_play();

CREATE OR REPLACE FUNCTION public.reset_dungeon_relay_timer_on_round()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.phase='active' AND (OLD.dungeon_position<>NEW.dungeon_position OR OLD.phase<>NEW.phase) THEN
    NEW.timer_deadline:=now()+interval '60 seconds'; NEW.timer_frozen:=false; NEW.timer_remaining_seconds:=60;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reset_dungeon_relay_timer_on_round_trigger BEFORE UPDATE OF dungeon_position,phase ON public.dungeon_relay_matches
FOR EACH ROW EXECUTE FUNCTION public.reset_dungeon_relay_timer_on_round();

CREATE OR REPLACE FUNCTION public.use_dungeon_relay_class_power(p_match_id uuid,p_card_ids uuid[],p_target_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_id text:=auth.uid()::text; current_match public.dungeon_relay_matches%ROWTYPE;
  actor public.dungeon_relay_players%ROWTYPE; dungeon public.dungeon_relay_dungeons%ROWTYPE;
  required_cost integer; eliminated boolean:=false; target_active boolean; base_order bigint;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  IF current_match.status<>'active' OR current_match.phase<>'active' THEN RAISE EXCEPTION 'match_not_accepting_powers'; END IF;
  SELECT * INTO actor FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=actor_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'active_player_required'; END IF;
  SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  IF dungeon.card_type='event' AND EXISTS(SELECT 1 FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=actor_id) THEN RAISE EXCEPTION 'event_already_confirmed'; END IF;
  required_cost:=CASE actor.class_id WHEN 'alchemist' THEN 1 WHEN 'cleric' THEN 4 ELSE 2 END;
  IF p_card_ids IS NULL OR cardinality(p_card_ids)<>required_cost THEN RAISE EXCEPTION 'invalid_power_cost'; END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(p_card_ids) selected(id))<>required_cost THEN RAISE EXCEPTION 'duplicate_card_selection'; END IF;
  IF (SELECT count(*) FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND id=ANY(p_card_ids))<>required_cost THEN RAISE EXCEPTION 'card_not_in_hand'; END IF;

  UPDATE public.dungeon_relay_cards card SET zone='discard',discarded_sequence=current_match.revision::bigint*100+array_position(p_card_ids,card.id)
  WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND id=ANY(p_card_ids);

  IF (actor.class_id='barbarian' AND dungeon.card_type='person') OR (actor.class_id='ranger' AND dungeon.card_type='beast')
    OR (actor.class_id='witch' AND dungeon.card_type='hazard') OR (actor.class_id='rogue' AND dungeon.card_type='obstacle') THEN
    WITH ranked AS (
      SELECT card.id,card.holder_id,row_number() OVER(PARTITION BY card.holder_id ORDER BY card.played_sequence,card.id) AS returned_rank,
        greatest(0,5-(SELECT count(*) FROM public.dungeon_relay_cards hand WHERE hand.match_id=p_match_id AND hand.holder_id=card.holder_id AND hand.zone='hand')) AS room
      FROM public.dungeon_relay_cards card WHERE card.match_id=p_match_id AND card.zone='played' AND card.played_round=current_match.dungeon_position AND card.holder_id<>actor_id
    )
    UPDATE public.dungeon_relay_cards card SET zone=CASE WHEN ranked.returned_rank<=ranked.room THEN 'hand' ELSE 'graveyard' END
    FROM ranked WHERE card.id=ranked.id;
    UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE match_id=p_match_id AND zone='played' AND played_round=current_match.dungeon_position;
    UPDATE public.dungeon_relay_matches SET phase='resolving',resolve_at=now()+interval '1800 milliseconds',revision=revision+1 WHERE id=p_match_id;
    eliminated:=true;
  ELSIF actor.class_id='investigator' THEN
    UPDATE public.dungeon_relay_cards card SET zone='hand' WHERE card.id IN(
      SELECT id FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='discard' ORDER BY discarded_sequence,id LIMIT 2
    );
  ELSIF actor.class_id='cleric' THEN
    SELECT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=p_target_id AND status='active') INTO target_active;
    IF NOT target_active THEN RAISE EXCEPTION 'active_target_required'; END IF;
    SELECT COALESCE(min(pile_order),0)-1 INTO base_order FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=p_target_id AND zone='deck';
    WITH pile AS (
      SELECT id,row_number() OVER(ORDER BY discarded_sequence DESC,id) AS offset FROM public.dungeon_relay_cards
      WHERE match_id=p_match_id AND holder_id=p_target_id AND zone='discard'
    ) UPDATE public.dungeon_relay_cards card SET zone='deck',pile_order=base_order-1000+pile.offset FROM pile WHERE card.id=pile.id;
  ELSIF actor.class_id='champion' THEN
    IF dungeon.card_type<>'event' OR dungeon.event_stage='completed' THEN RAISE EXCEPTION 'event_required'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=p_target_id AND status='active') INTO target_active;
    IF NOT target_active THEN RAISE EXCEPTION 'active_target_required'; END IF;
    INSERT INTO public.dungeon_relay_event_exclusions(match_id,dungeon_position,user_id,excluded_by)
    VALUES(p_match_id,current_match.dungeon_position,p_target_id,actor_id) ON CONFLICT DO NOTHING;
    IF dungeon.event_type='give_hands' AND dungeon.selected_target_id=p_target_id THEN
      UPDATE public.dungeon_relay_dungeons SET event_stage='voting',selected_target_id=NULL WHERE match_id=p_match_id AND position=current_match.dungeon_position;
      DELETE FROM public.dungeon_relay_event_votes WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
      DELETE FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
    ELSE
      DELETE FROM public.dungeon_relay_event_votes WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND voter_id=p_target_id;
      DELETE FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=p_target_id;
    END IF;
    PERFORM public.dungeon_relay_try_complete_event(p_match_id);
  ELSIF actor.class_id='alchemist' THEN
    PERFORM public.dungeon_relay_draw_exact(p_match_id,actor_id,2);
  ELSIF actor.class_id='wizard' THEN
    IF current_match.timer_frozen THEN RAISE EXCEPTION 'timer_already_frozen'; END IF;
    UPDATE public.dungeon_relay_matches SET timer_remaining_seconds=greatest(0,least(60,ceil(extract(epoch FROM timer_deadline-now()))::integer)),timer_deadline=NULL,timer_frozen=true WHERE id=p_match_id;
  ELSIF actor.class_id='swashbuckler' THEN
    PERFORM public.dungeon_relay_draw_exact(p_match_id,player.user_id,1) FROM public.dungeon_relay_players player
      WHERE player.match_id=p_match_id AND player.status='active' AND player.user_id<>actor_id ORDER BY player.seat;
  ELSE
    RAISE EXCEPTION 'power_not_available';
  END IF;

  IF EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=actor_id AND status='active')
    AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand') THEN
    PERFORM public.dungeon_relay_draw_to_five(p_match_id,actor_id);
  END IF;

  IF NOT eliminated THEN
    IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active') THEN
      UPDATE public.dungeon_relay_matches SET status='lost',phase='complete',ended_at=now(),revision=revision+1 WHERE id=p_match_id;
    ELSE UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id; END IF;
  END IF;
  INSERT INTO public.dungeon_relay_events(match_id,sequence,actor_id,event_type,payload)
  VALUES(p_match_id,current_match.revision+1,actor_id,'class_power',jsonb_build_object('classId',actor.class_id,'cardIds',to_jsonb(p_card_ids),'targetId',p_target_id,'eliminated',eliminated));
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
  RETURN eliminated;
END $$;

REVOKE ALL ON FUNCTION public.use_dungeon_relay_class_power(uuid,uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_dungeon_relay_class_power(uuid,uuid[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dungeon_relay_try_complete_event(p_match_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_match public.dungeon_relay_matches%ROWTYPE; dungeon public.dungeon_relay_dungeons%ROWTYPE; participant_count integer; action_count integer; winner text;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id;
  SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  IF dungeon.card_type<>'event' OR dungeon.event_stage='completed' THEN RETURN false; END IF;
  SELECT count(*) INTO participant_count FROM public.dungeon_relay_players player WHERE player.match_id=p_match_id AND player.status='active'
    AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions excluded WHERE excluded.match_id=p_match_id AND excluded.dungeon_position=current_match.dungeon_position AND excluded.user_id=player.user_id);

  IF dungeon.event_stage='voting' THEN
    SELECT count(*) INTO action_count FROM public.dungeon_relay_event_votes vote JOIN public.dungeon_relay_players player ON player.match_id=vote.match_id AND player.user_id=vote.voter_id AND player.status='active'
    WHERE vote.match_id=p_match_id AND vote.dungeon_position=current_match.dungeon_position
      AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions excluded WHERE excluded.match_id=p_match_id AND excluded.dungeon_position=current_match.dungeon_position AND excluded.user_id=vote.voter_id);
    IF action_count=participant_count AND participant_count>0 THEN
      SELECT vote.target_id INTO winner FROM public.dungeon_relay_event_votes vote JOIN public.dungeon_relay_players target ON target.match_id=vote.match_id AND target.user_id=vote.target_id
      WHERE vote.match_id=p_match_id AND vote.dungeon_position=current_match.dungeon_position GROUP BY vote.target_id,target.seat ORDER BY count(*) DESC,target.seat LIMIT 1;
      UPDATE public.dungeon_relay_dungeons SET selected_target_id=winner,event_stage='confirming' WHERE match_id=p_match_id AND position=current_match.dungeon_position;
      RETURN false;
    ELSIF participant_count>0 THEN RETURN false;
    END IF;
  END IF;

  SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  SELECT count(*) INTO action_count FROM public.dungeon_relay_event_confirmations confirmation JOIN public.dungeon_relay_players player ON player.match_id=confirmation.match_id AND player.user_id=confirmation.user_id AND player.status='active'
    WHERE confirmation.match_id=p_match_id AND confirmation.dungeon_position=current_match.dungeon_position
      AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions excluded WHERE excluded.match_id=p_match_id AND excluded.dungeon_position=current_match.dungeon_position AND excluded.user_id=confirmation.user_id);
  IF action_count<>participant_count THEN RETURN false; END IF;

  IF dungeon.event_type='give_hands' AND dungeon.selected_target_id IS NOT NULL THEN
    UPDATE public.dungeon_relay_cards card SET holder_id=dungeon.selected_target_id WHERE card.match_id=p_match_id AND card.zone='hand'
      AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions excluded WHERE excluded.match_id=p_match_id AND excluded.dungeon_position=current_match.dungeon_position AND excluded.user_id=card.holder_id);
  ELSIF dungeon.event_type='pass_left' AND participant_count>1 THEN
    WITH ordered_players AS (
      SELECT player.user_id,lead(player.user_id) OVER(ORDER BY player.seat) AS following_user,first_value(player.user_id) OVER(ORDER BY player.seat) AS first_user
      FROM public.dungeon_relay_players player WHERE player.match_id=p_match_id AND player.status='active'
        AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions excluded WHERE excluded.match_id=p_match_id AND excluded.dungeon_position=current_match.dungeon_position AND excluded.user_id=player.user_id)
    ), rotation AS (SELECT user_id,COALESCE(following_user,first_user) AS next_user FROM ordered_players)
    UPDATE public.dungeon_relay_cards card SET holder_id=rotation.next_user FROM rotation WHERE card.match_id=p_match_id AND card.zone='hand' AND card.holder_id=rotation.user_id;
  END IF;
  UPDATE public.dungeon_relay_dungeons SET event_stage='completed' WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  UPDATE public.dungeon_relay_matches SET phase='resolving',resolve_at=now()+interval '1800 milliseconds' WHERE id=p_match_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.dungeon_relay_try_complete_event(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.vote_dungeon_relay_event_target(p_match_id uuid,p_target_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id text:=auth.uid()::text; current_match public.dungeon_relay_matches%ROWTYPE;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  IF current_match.status<>'active' OR current_match.phase<>'active' OR NOT EXISTS(SELECT 1 FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position AND event_type='give_hands' AND event_stage='voting') THEN RAISE EXCEPTION 'event_not_voting'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players player WHERE player.match_id=p_match_id AND player.user_id=actor_id AND player.status='active' AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions excluded WHERE excluded.match_id=p_match_id AND excluded.dungeon_position=current_match.dungeon_position AND excluded.user_id=player.user_id)) THEN RAISE EXCEPTION 'event_player_excluded'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players player WHERE player.match_id=p_match_id AND player.user_id=p_target_id AND player.status='active' AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions excluded WHERE excluded.match_id=p_match_id AND excluded.dungeon_position=current_match.dungeon_position AND excluded.user_id=player.user_id)) THEN RAISE EXCEPTION 'active_target_required'; END IF;
  INSERT INTO public.dungeon_relay_event_votes(match_id,dungeon_position,voter_id,target_id) VALUES(p_match_id,current_match.dungeon_position,actor_id,p_target_id)
    ON CONFLICT(match_id,dungeon_position,voter_id) DO UPDATE SET target_id=excluded.target_id,updated_at=now();
  PERFORM public.dungeon_relay_try_complete_event(p_match_id);
  UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id;
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
END $$;

CREATE OR REPLACE FUNCTION public.discard_dungeon_relay_event_cards(p_match_id uuid,p_card_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id text:=auth.uid()::text; current_match public.dungeon_relay_matches%ROWTYPE; dungeon public.dungeon_relay_dungeons%ROWTYPE;
BEGIN
  IF p_card_ids IS NULL OR cardinality(p_card_ids)<1 THEN RAISE EXCEPTION 'select_event_cards'; END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(p_card_ids) selected(id))<>cardinality(p_card_ids) THEN RAISE EXCEPTION 'duplicate_card_selection'; END IF;
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  IF current_match.phase<>'active' OR dungeon.card_type<>'event' OR dungeon.event_type NOT IN('discard_shields','discard_multis') THEN RAISE EXCEPTION 'event_does_not_discard'; END IF;
  IF EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=actor_id) THEN RAISE EXCEPTION 'event_player_excluded'; END IF;
  IF EXISTS(SELECT 1 FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=actor_id) THEN RAISE EXCEPTION 'event_already_confirmed'; END IF;
  IF (SELECT count(*) FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND id=ANY(p_card_ids)
    AND ((dungeon.event_type='discard_shields' AND symbol='shield') OR (dungeon.event_type='discard_multis' AND symbol_count>1)))<>cardinality(p_card_ids) THEN RAISE EXCEPTION 'card_not_event_eligible'; END IF;
  UPDATE public.dungeon_relay_cards card SET zone='event_discard',played_round=current_match.dungeon_position,discarded_sequence=current_match.revision::bigint*100+array_position(p_card_ids,card.id)
    WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND id=ANY(p_card_ids);
  UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id;
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_dungeon_relay_event(p_match_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id text:=auth.uid()::text; current_match public.dungeon_relay_matches%ROWTYPE; dungeon public.dungeon_relay_dungeons%ROWTYPE; completed boolean;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
  IF current_match.phase<>'active' OR dungeon.card_type<>'event' OR dungeon.event_stage<>'confirming' THEN RAISE EXCEPTION 'event_not_confirming'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=actor_id AND status='active') THEN RAISE EXCEPTION 'active_player_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.dungeon_relay_event_exclusions WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=actor_id) THEN RAISE EXCEPTION 'event_player_excluded'; END IF;
  IF dungeon.event_type='discard_shields' AND EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND symbol='shield') THEN RAISE EXCEPTION 'eligible_cards_remain'; END IF;
  IF dungeon.event_type='discard_multis' AND EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND symbol_count>1) THEN RAISE EXCEPTION 'eligible_cards_remain'; END IF;
  INSERT INTO public.dungeon_relay_event_confirmations(match_id,dungeon_position,user_id) VALUES(p_match_id,current_match.dungeon_position,actor_id) ON CONFLICT DO NOTHING;
  completed:=public.dungeon_relay_try_complete_event(p_match_id);
  UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id;
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
  RETURN completed;
END $$;

CREATE OR REPLACE FUNCTION public.advance_dungeon_relay_round(p_match_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_match public.dungeon_relay_matches%ROWTYPE; player record; next_position integer; next_dungeon public.dungeon_relay_dungeons%ROWTYPE;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  IF current_match.phase<>'resolving' THEN RETURN false; END IF;
  IF current_match.resolve_at IS NOT NULL AND now()<current_match.resolve_at THEN RETURN false; END IF;
  UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE match_id=p_match_id AND zone='played' AND played_round=current_match.dungeon_position;
  UPDATE public.dungeon_relay_cards SET zone='discard',discarded_sequence=COALESCE(discarded_sequence,current_match.revision::bigint*100+draw_order)
    WHERE match_id=p_match_id AND zone='event_discard' AND played_round=current_match.dungeon_position;
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
