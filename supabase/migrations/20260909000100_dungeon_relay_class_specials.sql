/* 60-card class decks and server-authoritative special cards. Existing runs keep their decks. */
ALTER TABLE public.dungeon_relay_cards
  ADD COLUMN special text CHECK (special IN ('slay_boss','counter_event','slay_person','gift_three','wild_three','cleric_blessing','slay_beast','all_colors')),
  ADD COLUMN chosen_symbols jsonb;
ALTER TABLE public.dungeon_relay_cards DROP CONSTRAINT dungeon_relay_cards_draw_order_check;
ALTER TABLE public.dungeon_relay_cards ADD CONSTRAINT dungeon_relay_cards_draw_order_check CHECK(draw_order BETWEEN 1 AND 60);
ALTER TABLE public.dungeon_relay_events DROP CONSTRAINT dungeon_relay_events_event_type_check;
ALTER TABLE public.dungeon_relay_events ADD CONSTRAINT dungeon_relay_events_event_type_check CHECK(event_type IN('match_started','cards_played','round_advanced','class_power','special_card'));

CREATE OR REPLACE FUNCTION public.dungeon_relay_class_deck(p_class text)
RETURNS TABLE(symbol text,special text,copies integer) LANGUAGE sql IMMUTABLE AS $$
 SELECT decks.symbol,decks.special,decks.copies FROM (VALUES
 ('barbarian','sword','slay_person',3),('swashbuckler','sword','slay_person',3),
 ('ranger','arrow','slay_beast',3),('alchemist','arrow','all_colors',3),
 ('rogue','dagger','wild_three',3),('investigator','dagger','wild_three',3),
 ('wizard','staff','gift_three',3),('witch','staff','counter_event',2),
 ('champion','shield','slay_boss',1),('cleric','shield','cleric_blessing',3)
 ) AS decks(class_id,symbol,special,copies) WHERE class_id=p_class;
$$;
REVOKE ALL ON FUNCTION public.dungeon_relay_class_deck(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dungeon_relay_card_tokens(p_symbol text,p_count integer,p_special text,p_chosen jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN p_special='all_colors' THEN '{"sword":1,"arrow":1,"shield":1,"staff":1,"dagger":1}'::jsonb
 WHEN p_special='wild_three' THEN COALESCE(p_chosen,'{}'::jsonb)
 WHEN p_special IS NULL THEN jsonb_build_object(p_symbol,p_count) ELSE '{}'::jsonb END;
$$;
REVOKE ALL ON FUNCTION public.dungeon_relay_card_tokens(text,integer,text,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dungeon_relay_symbols_matched(p_match_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
 SELECT NOT EXISTS (
 SELECT 1 FROM public.dungeon_relay_matches m
 JOIN public.dungeon_relay_dungeons d ON d.match_id=m.id AND d.position=m.dungeon_position
 CROSS JOIN LATERAL jsonb_each_text(d.requirements) required
 WHERE m.id=p_match_id AND required.value::integer > (
 SELECT COALESCE(sum(COALESCE((public.dungeon_relay_card_tokens(c.symbol,c.symbol_count,c.special,c.chosen_symbols)->>required.key)::integer,0)),0)
 FROM public.dungeon_relay_cards c WHERE c.match_id=m.id AND c.zone='played' AND c.played_round=m.dungeon_position));
$$;
REVOKE ALL ON FUNCTION public.dungeon_relay_symbols_matched(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dungeon_relay_event_eligible(p_symbol text,p_count integer,p_special text,p_event text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN p_special IS NULL THEN (p_event='discard_shields' AND p_symbol='shield') OR (p_event='discard_multis' AND p_count>1)
 ELSE (p_event='discard_shields' AND p_special='all_colors') OR (p_event='discard_multis' AND p_special IN('wild_three','all_colors')) END;
$$;
REVOKE ALL ON FUNCTION public.dungeon_relay_event_eligible(text,integer,text,text) FROM PUBLIC;

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

  WITH templates AS (
    SELECT player.user_id,symbol.name AS symbol,counts.n AS symbol_count,copy.n AS copy_number,NULL::text AS special
    FROM public.dungeon_relay_players player
    CROSS JOIN LATERAL public.dungeon_relay_class_deck(player.class_id) deck
    CROSS JOIN (VALUES ('sword'),('arrow'),('shield'),('staff'),('dagger')) symbol(name)
    CROSS JOIN generate_series(1,3) counts(n)
    CROSS JOIN LATERAL generate_series(1,CASE counts.n
      WHEN 1 THEN CASE WHEN symbol.name=deck.symbol THEN 10-deck.copies ELSE 8 END
      WHEN 2 THEN 3 ELSE CASE WHEN symbol.name=deck.symbol THEN 3 ELSE 0 END END) copy(n)
    WHERE player.match_id=new_match_id
    UNION ALL
    SELECT player.user_id,deck.symbol,1,copy.n,deck.special
    FROM public.dungeon_relay_players player CROSS JOIN LATERAL public.dungeon_relay_class_deck(player.class_id) deck
    CROSS JOIN LATERAL generate_series(1,deck.copies) copy(n) WHERE player.match_id=new_match_id
  ), hashed AS (
    SELECT *,md5(new_seed::text||':'||user_id||':'||symbol||':'||symbol_count||':'||copy_number||':'||COALESCE(special,'normal')) AS card_hash FROM templates
  ), ordered AS (
    SELECT *,row_number() OVER(PARTITION BY user_id ORDER BY card_hash)::smallint AS card_order FROM hashed
  )
  INSERT INTO public.dungeon_relay_cards(id,match_id,user_id,symbol,symbol_count,special,draw_order,pile_order)
  SELECT card_hash::uuid,new_match_id,user_id,symbol,symbol_count,special,card_order,card_order FROM ordered;

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
    'rulesVersion', 'dungeon-relay-class-specials-2'
  ));

  RETURN new_match_id;
END;
$$;

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
  IF EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND id=ANY(p_card_ids) AND special IS NOT NULL) THEN RAISE EXCEPTION 'use_special_card_action'; END IF;
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
    defeated:=public.dungeon_relay_symbols_matched(p_match_id);
  END IF;
  IF defeated THEN UPDATE public.dungeon_relay_matches SET phase='resolving',resolve_at=now()+interval '1800 milliseconds',revision=revision+1 WHERE id=p_match_id;
  ELSIF NOT EXISTS (SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active') THEN UPDATE public.dungeon_relay_matches SET status='lost',phase='complete',ended_at=now(),revision=revision+1 WHERE id=p_match_id;
  ELSE UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id; END IF;
  INSERT INTO public.dungeon_relay_events(match_id,sequence,actor_id,event_type,payload) VALUES(p_match_id,current_match.revision+1,actor_id,'cards_played',jsonb_build_object('dungeonPosition',current_match.dungeon_position,'cardIds',to_jsonb(p_card_ids),'defeated',defeated));
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
  RETURN defeated;
END $$;

CREATE OR REPLACE FUNCTION public.get_dungeon_relay_state(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'match',jsonb_build_object('id',match.id,'teamId',match.team_id,'leaderId',match.leader_id,'status',match.status,'phase',match.phase,'dungeonPosition',match.dungeon_position,'totalDungeons',11,'revision',match.revision,'resolveAt',match.resolve_at,'timerDeadline',match.timer_deadline,'timerFrozen',match.timer_frozen,'timerRemainingSeconds',match.timer_remaining_seconds,'timerResumeLockedUntil',match.timer_resume_locked_until),
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
    'self',(SELECT jsonb_build_object('userId',player.user_id,'status',player.status,'hand',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'symbol',card.symbol,'symbols',card.symbol_count,'special',card.special,'chosenSymbols',card.chosen_symbols) ORDER BY card.pile_order,card.id) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='hand'),'[]'::jsonb)) FROM public.dungeon_relay_players player WHERE player.match_id=match.id AND player.user_id=auth.uid()::text),
    'playedCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'special',card.special,'chosenSymbols',card.chosen_symbols,'playedOrder',card.played_sequence) ORDER BY card.played_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='played' AND card.played_round=match.dungeon_position),'[]'::jsonb),
    'eventDiscardCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'special',card.special,'chosenSymbols',card.chosen_symbols,'playedOrder',0) ORDER BY card.discarded_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='event_discard' AND card.played_round=match.dungeon_position),'[]'::jsonb),
    'discardCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'special',card.special,'chosenSymbols',card.chosen_symbols,'playedOrder',COALESCE(card.discarded_sequence,0)) ORDER BY owner.seat,card.discarded_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='discard'),'[]'::jsonb)
  ) INTO result FROM public.dungeon_relay_matches match JOIN public.dungeon_relay_dungeons dungeon ON dungeon.match_id=match.id AND dungeon.position=match.dungeon_position WHERE match.id=p_match_id;
  IF result IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;
  RETURN result;
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
    AND public.dungeon_relay_event_eligible(symbol,symbol_count,special,dungeon.event_type))<>cardinality(p_card_ids) THEN RAISE EXCEPTION 'card_not_event_eligible'; END IF;
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
  IF dungeon.event_type='discard_shields' AND EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND public.dungeon_relay_event_eligible(symbol,symbol_count,special,'discard_shields')) THEN RAISE EXCEPTION 'eligible_cards_remain'; END IF;
  IF dungeon.event_type='discard_multis' AND EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand' AND public.dungeon_relay_event_eligible(symbol,symbol_count,special,'discard_multis')) THEN RAISE EXCEPTION 'eligible_cards_remain'; END IF;
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
          WHERE card.match_id=p_match_id AND card.zone='hand' AND public.dungeon_relay_event_eligible(card.symbol,card.symbol_count,card.special,next_dungeon.event_type)
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


-- The match row lock serializes all commands; card ownership is always checked on the server.
CREATE OR REPLACE FUNCTION public.play_dungeon_relay_special(
  p_match_id uuid,p_card_id uuid,p_target_id text DEFAULT NULL,p_mode text DEFAULT NULL,p_symbols jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor_id text:=auth.uid()::text;
 current_match public.dungeon_relay_matches%ROWTYPE;
 dungeon public.dungeon_relay_dungeons%ROWTYPE;
 card public.dungeon_relay_cards%ROWTYPE;
 target public.dungeon_relay_players%ROWTYPE;
 defeated boolean:=false;
 transfer_count integer;
 base_order bigint;
BEGIN
 SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
 IF actor_id IS NULL OR NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
 IF current_match.status<>'active' OR current_match.phase<>'active' THEN RAISE EXCEPTION 'match_not_accepting_plays'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=actor_id AND status='active') THEN RAISE EXCEPTION 'spectators_cannot_play'; END IF;
 SELECT * INTO dungeon FROM public.dungeon_relay_dungeons WHERE match_id=p_match_id AND position=current_match.dungeon_position;
 IF dungeon.card_type='event' AND EXISTS(SELECT 1 FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=actor_id) THEN RAISE EXCEPTION 'event_already_confirmed'; END IF;
 SELECT * INTO card FROM public.dungeon_relay_cards WHERE id=p_card_id AND match_id=p_match_id AND holder_id=actor_id AND zone='hand';
 IF NOT FOUND THEN RAISE EXCEPTION 'card_not_in_hand'; END IF;
 IF card.special IS NULL THEN RAISE EXCEPTION 'special_card_required'; END IF;
 IF card.special<>'wild_three' AND p_symbols IS NOT NULL THEN RAISE EXCEPTION 'invalid_special_symbols'; END IF;
 IF card.special<>'cleric_blessing' AND p_mode IS NOT NULL THEN RAISE EXCEPTION 'invalid_special_mode'; END IF;
 IF card.special NOT IN('gift_three','cleric_blessing') AND p_target_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_special_target'; END IF;
 IF card.special='wild_three' THEN
   IF p_symbols IS NULL OR jsonb_typeof(p_symbols)<>'object' THEN RAISE EXCEPTION 'invalid_special_symbols'; END IF;
   IF (SELECT count(*) FROM jsonb_each(p_symbols))<>5 OR NOT p_symbols ?& ARRAY['sword','arrow','shield','staff','dagger'] THEN RAISE EXCEPTION 'invalid_special_symbols'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(p_symbols) v WHERE jsonb_typeof(v.value)<>'number' OR v.value::text !~ '^[0-3]$') THEN RAISE EXCEPTION 'invalid_special_symbols'; END IF;
   IF (SELECT sum(value::integer) FROM jsonb_each_text(p_symbols))<>3 THEN RAISE EXCEPTION 'invalid_special_symbols'; END IF;
 END IF;
 IF card.special='slay_boss' AND dungeon.card_type NOT IN('mini_boss','boss')
   OR card.special='slay_person' AND dungeon.card_type<>'person'
   OR card.special='slay_beast' AND dungeon.card_type<>'beast' THEN RAISE EXCEPTION 'special_not_available'; END IF;
 IF card.special='gift_three' OR (card.special='cleric_blessing' AND p_mode='transfer') THEN
   SELECT * INTO target FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=p_target_id AND user_id<>actor_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'other_player_required'; END IF;
   IF card.special='gift_three' AND target.status<>'active' THEN RAISE EXCEPTION 'active_target_required'; END IF;
 END IF;
 IF card.special='cleric_blessing' THEN
   IF p_mode IS NULL OR p_mode NOT IN('transfer','draw_all') THEN RAISE EXCEPTION 'invalid_special_mode'; END IF;
   IF p_mode='draw_all' AND p_target_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_special_target'; END IF;
   IF p_mode='transfer' THEN
     SELECT count(*)/2 INTO transfer_count FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='deck';
     IF transfer_count=0 THEN RAISE EXCEPTION 'not_enough_deck_to_share'; END IF;
   END IF;
 END IF;

 -- Playing a special triggers the same timer expiry / freeze lockout checks as normal cards.
 UPDATE public.dungeon_relay_cards SET zone='played',played_round=current_match.dungeon_position,
   played_sequence=current_match.revision::bigint*100+1,chosen_symbols=p_symbols WHERE id=p_card_id;
 IF card.special IN('slay_boss','slay_person','slay_beast') THEN
   defeated:=true;
 ELSIF card.special='counter_event' THEN
   IF dungeon.card_type='event' THEN
     -- Cancel the remaining event, including votes and pending exchanges. Earlier voluntary discards remain spent.
     UPDATE public.dungeon_relay_dungeons SET event_stage='completed',selected_target_id=NULL WHERE match_id=p_match_id AND position=current_match.dungeon_position;
     DELETE FROM public.dungeon_relay_event_votes WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
     DELETE FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
     defeated:=true;
   ELSE PERFORM public.dungeon_relay_draw_exact(p_match_id,actor_id,2); END IF;
 ELSIF card.special='gift_three' THEN
   PERFORM public.dungeon_relay_draw_exact(p_match_id,p_target_id,3);
   DELETE FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=p_target_id;
 ELSIF card.special='cleric_blessing' THEN
   IF p_mode='draw_all' THEN
     PERFORM public.dungeon_relay_draw_exact(p_match_id,player.user_id,2) FROM public.dungeon_relay_players player
       WHERE player.match_id=p_match_id AND player.status='active' AND player.user_id<>actor_id ORDER BY player.seat;
     DELETE FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id<>actor_id;
   ELSE
     SELECT COALESCE(max(pile_order),0) INTO base_order FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=p_target_id AND zone='deck';
     WITH donated AS (
       SELECT id,row_number() OVER(ORDER BY pile_order,id) AS ordinal FROM public.dungeon_relay_cards
       WHERE match_id=p_match_id AND holder_id=actor_id AND zone='deck' ORDER BY pile_order,id LIMIT transfer_count
     ) UPDATE public.dungeon_relay_cards c SET holder_id=p_target_id,pile_order=base_order+donated.ordinal FROM donated WHERE c.id=donated.id;
     IF target.status='dead' THEN
       UPDATE public.dungeon_relay_players SET status='active',died_at=NULL WHERE match_id=p_match_id AND user_id=p_target_id;
       -- A small donation still revives: draw what is available without a forced five-card death.
       PERFORM public.dungeon_relay_draw_exact(p_match_id,p_target_id,least(5,transfer_count));
       DELETE FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND user_id=p_target_id;
       DELETE FROM public.dungeon_relay_event_votes WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position AND voter_id=p_target_id;
     END IF;
   END IF;
 END IF;
 IF NOT defeated AND dungeon.card_type<>'event' THEN defeated:=public.dungeon_relay_symbols_matched(p_match_id); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_cards WHERE match_id=p_match_id AND holder_id=actor_id AND zone='hand') THEN
   PERFORM public.dungeon_relay_draw_to_five(p_match_id,actor_id);
 END IF;
 -- Drawing may kill the voted recipient; reopen that vote rather than leaving the event stuck.
 IF NOT defeated AND dungeon.event_type='give_hands' THEN
   DELETE FROM public.dungeon_relay_event_votes v WHERE v.match_id=p_match_id AND v.dungeon_position=current_match.dungeon_position AND (
     NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players p WHERE p.match_id=p_match_id AND p.user_id=v.voter_id AND p.status='active') OR
     NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players p WHERE p.match_id=p_match_id AND p.user_id=v.target_id AND p.status='active'));
   IF dungeon.selected_target_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND user_id=dungeon.selected_target_id AND status='active') THEN
     UPDATE public.dungeon_relay_dungeons SET event_stage='voting',selected_target_id=NULL WHERE match_id=p_match_id AND position=current_match.dungeon_position;
     DELETE FROM public.dungeon_relay_event_votes WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
     DELETE FROM public.dungeon_relay_event_confirmations WHERE match_id=p_match_id AND dungeon_position=current_match.dungeon_position;
   END IF;
 END IF;
 IF defeated THEN
   UPDATE public.dungeon_relay_matches SET phase='resolving',resolve_at=now()+interval '1800 milliseconds' WHERE id=p_match_id;
 ELSIF NOT EXISTS(SELECT 1 FROM public.dungeon_relay_players WHERE match_id=p_match_id AND status='active') THEN
   UPDATE public.dungeon_relay_matches SET status='lost',phase='complete',ended_at=now() WHERE id=p_match_id;
 ELSIF dungeon.card_type='event' THEN
   PERFORM public.dungeon_relay_try_complete_event(p_match_id);
 END IF;
 UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id;
 INSERT INTO public.dungeon_relay_events(match_id,sequence,actor_id,event_type,payload)
 VALUES(p_match_id,current_match.revision+1,actor_id,'special_card',jsonb_build_object('cardId',p_card_id,'special',card.special,'targetId',p_target_id,'mode',p_mode,'symbols',p_symbols,'defeated',defeated));
 UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
 RETURN defeated;
END $$;
REVOKE ALL ON FUNCTION public.play_dungeon_relay_special(uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.play_dungeon_relay_special(uuid,uuid,text,text,jsonb) TO authenticated;
