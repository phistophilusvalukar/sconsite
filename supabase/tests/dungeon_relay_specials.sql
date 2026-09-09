-- Run after the isolated bootstrap and Dungeon Relay migrations. All fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.check(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion_failed: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
   IF position(expected IN SQLERRM)>0 THEN RETURN; END IF;
   RAISE;
 END;
 RAISE EXCEPTION 'expected rejection: %',expected;
END $$;
CREATE FUNCTION pg_temp.fixture(chosen_class text,encounter text DEFAULT 'obstacle',event_kind text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE team uuid; run uuid; player_a text:='11111111-1111-4111-8111-111111111111'; player_b text:='22222222-2222-4222-8222-222222222222';
BEGIN
 INSERT INTO public.users VALUES(player_a,'One',''),(player_b,'Two','') ON CONFLICT DO NOTHING;
 -- The production starter returns an active team match, so each fixture uses a new team.
 DELETE FROM public.multiplayer_team_members WHERE user_id IN(player_a,player_b);
 UPDATE public.multiplayer_teams SET leader_id=NULL WHERE leader_id=player_a;
 INSERT INTO public.multiplayer_teams(leader_id) VALUES(player_a) RETURNING id INTO team;
 INSERT INTO public.multiplayer_team_members(team_id,user_id) VALUES(team,player_a),(team,player_b);
 INSERT INTO public.multiplayer_lobby_players(user_id,color) VALUES(player_a,public.dungeon_relay_class_color(chosen_class)),(player_b,'azure')
 ON CONFLICT(user_id) DO UPDATE SET color=excluded.color;
 PERFORM set_config('request.jwt.claim.sub',player_a,true);
 run:=public.start_dungeon_relay_match();
 -- Stable encounters for command tests; generation has its own production trigger.
 ALTER TABLE public.dungeon_relay_dungeons DISABLE TRIGGER configure_dungeon_relay_card_trigger;
 UPDATE public.dungeon_relay_dungeons SET card_type=encounter,event_type=event_kind,
 event_stage=CASE WHEN encounter='event' THEN CASE WHEN event_kind='give_hands' THEN 'voting' ELSE 'confirming' END ELSE NULL END,
 requirements='{"sword":3,"arrow":3,"shield":3,"staff":3,"dagger":3}' WHERE match_id=run AND position=1;
 ALTER TABLE public.dungeon_relay_dungeons ENABLE TRIGGER configure_dungeon_relay_card_trigger;
 RETURN run;
END $$;
CREATE FUNCTION pg_temp.special(run uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE chosen uuid;
BEGIN
 SELECT id INTO chosen FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=auth.uid()::text AND special IS NOT NULL ORDER BY draw_order LIMIT 1;
 UPDATE public.dungeon_relay_cards SET zone='hand' WHERE id=chosen;
 RETURN chosen;
END $$;
DO $$
DECLARE
 run uuid; chosen uuid; class_name text; definition record; snapshot jsonb; count_before integer; donated integer; result boolean;
 player_a text:='11111111-1111-4111-8111-111111111111'; player_b text:='22222222-2222-4222-8222-222222222222';
BEGIN
 FOREACH class_name IN ARRAY ARRAY['barbarian','swashbuckler','ranger','alchemist','rogue','investigator','wizard','witch','champion','cleric'] LOOP
   run:=pg_temp.fixture(class_name);
   SELECT * INTO definition FROM public.dungeon_relay_class_deck(class_name);
   PERFORM pg_temp.check((SELECT count(*)=60 AND count(DISTINCT id)=60 FROM public.dungeon_relay_cards WHERE match_id=run AND user_id=player_a),'60 unique cards for '||class_name);
   PERFORM pg_temp.check((SELECT count(*)=definition.copies FROM public.dungeon_relay_cards WHERE match_id=run AND user_id=player_a AND special=definition.special),'special count for '||class_name);
   PERFORM pg_temp.check((SELECT count(*)=3 AND bool_and(symbol=definition.symbol) FROM public.dungeon_relay_cards WHERE match_id=run AND user_id=player_a AND symbol_count=3),'class-color triples for '||class_name);
   PERFORM pg_temp.check((SELECT count(*)=15 FROM public.dungeon_relay_cards WHERE match_id=run AND user_id=player_a AND symbol_count=2),'15 doubles');
   PERFORM pg_temp.check((SELECT count(*)=5 FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_a AND zone='hand'),'initial hand');
   PERFORM pg_temp.check((SELECT bool_and(pile_order=draw_order) FROM public.dungeon_relay_cards WHERE match_id=run),'seeded pile order');
   snapshot:=public.get_dungeon_relay_state(run);
   PERFORM pg_temp.check(NOT (snapshot->'players'->1 ? 'hand') AND NOT (snapshot->'players'->1 ? 'deck'),'private cards omitted');
   PERFORM pg_temp.check(jsonb_array_length(snapshot->'self'->'hand')=5,'private hand returned');
 END LOOP;

 FOREACH class_name IN ARRAY ARRAY['barbarian','swashbuckler','ranger','champion'] LOOP
   run:=pg_temp.fixture(class_name,CASE class_name WHEN 'ranger' THEN 'beast' WHEN 'champion' THEN 'boss' ELSE 'person' END);
   chosen:=pg_temp.special(run);
   PERFORM pg_temp.check(public.play_dungeon_relay_special(run,chosen),'instant defeat for '||class_name);
   PERFORM pg_temp.check((SELECT phase='resolving' FROM public.dungeon_relay_matches WHERE id=run),'instant defeat resolves');
   PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L)',run,chosen),'match_not_accepting_plays');
 END LOOP;
 run:=pg_temp.fixture('champion','mini_boss'); chosen:=pg_temp.special(run);
 PERFORM pg_temp.check(public.play_dungeon_relay_special(run,chosen),'champion defeats miniboss');
 run:=pg_temp.fixture('champion'); chosen:=pg_temp.special(run);
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L)',run,chosen),'special_not_available');
 PERFORM pg_temp.check((SELECT zone='hand' FROM public.dungeon_relay_cards WHERE id=chosen),'rejected card unspent');

 FOREACH class_name IN ARRAY ARRAY['discard_shields','discard_multis','give_hands','pass_left'] LOOP
   run:=pg_temp.fixture('witch','event',class_name); chosen:=pg_temp.special(run);
   PERFORM pg_temp.check(public.play_dungeon_relay_special(run,chosen),'witch cancels '||class_name);
   PERFORM pg_temp.check((SELECT event_stage='completed' FROM public.dungeon_relay_dungeons WHERE match_id=run AND position=1),'event completed');
 END LOOP;
 run:=pg_temp.fixture('witch'); chosen:=pg_temp.special(run);
 SELECT count(*) INTO count_before FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_a AND zone='hand';
 PERFORM public.play_dungeon_relay_special(run,chosen);
 PERFORM pg_temp.check((SELECT count(*)=count_before+1 FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_a AND zone='hand'),'witch spends one and draws two');

 run:=pg_temp.fixture('wizard'); chosen:=pg_temp.special(run);
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L,%L)',run,chosen,player_a),'other_player_required');
 PERFORM public.play_dungeon_relay_special(run,chosen,player_b);
 PERFORM pg_temp.check((SELECT count(*)=8 FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_b AND zone='hand'),'wizard gives three');
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L,%L)',run,chosen,player_b),'card_not_in_hand');

 FOREACH class_name IN ARRAY ARRAY['rogue','investigator'] LOOP
   run:=pg_temp.fixture(class_name); chosen:=pg_temp.special(run);
   PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L,NULL,NULL,%L)',run,chosen,'{"sword":4,"arrow":0,"shield":0,"staff":0,"dagger":0}'),'invalid_special_symbols');
   PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L,NULL,NULL,%L)',run,chosen,'{"sword":3}'),'invalid_special_symbols');
   PERFORM public.play_dungeon_relay_special(run,chosen,NULL,NULL,'{"sword":1,"arrow":1,"shield":0,"staff":1,"dagger":0}');
   PERFORM pg_temp.check((SELECT chosen_symbols->>'sword'='1' FROM public.dungeon_relay_cards WHERE id=chosen),'wild symbols persisted');
   snapshot:=public.get_dungeon_relay_state(run);
   PERFORM pg_temp.check(snapshot->'playedCards'->0->'chosenSymbols'->>'staff'='1','wild symbols in public played snapshot');
 END LOOP;
 run:=pg_temp.fixture('rogue'); chosen:=pg_temp.special(run);
 PERFORM public.play_dungeon_relay_special(run,chosen,NULL,NULL,'{"sword":3,"arrow":0,"shield":0,"staff":0,"dagger":0}');
 PERFORM pg_temp.check((SELECT chosen_symbols->>'sword'='3' FROM public.dungeon_relay_cards WHERE id=chosen),'repeated wild symbols');

 run:=pg_temp.fixture('alchemist'); chosen:=pg_temp.special(run);
 ALTER TABLE public.dungeon_relay_dungeons DISABLE TRIGGER configure_dungeon_relay_card_trigger;
 UPDATE public.dungeon_relay_dungeons SET requirements='{"sword":1,"arrow":1,"shield":1,"staff":1,"dagger":1}' WHERE match_id=run AND position=1;
 ALTER TABLE public.dungeon_relay_dungeons ENABLE TRIGGER configure_dungeon_relay_card_trigger;
 PERFORM pg_temp.check(public.play_dungeon_relay_special(run,chosen),'alchemist contributes five colors');

 -- Normal plays count symbols already committed by a wildcard.
 run:=pg_temp.fixture('rogue'); chosen:=pg_temp.special(run);
 ALTER TABLE public.dungeon_relay_dungeons DISABLE TRIGGER configure_dungeon_relay_card_trigger;
 UPDATE public.dungeon_relay_dungeons SET requirements='{"sword":3,"arrow":1,"shield":0,"staff":0,"dagger":0}' WHERE match_id=run AND position=1;
 ALTER TABLE public.dungeon_relay_dungeons ENABLE TRIGGER configure_dungeon_relay_card_trigger;
 PERFORM public.play_dungeon_relay_special(run,chosen,NULL,NULL,'{"sword":3,"arrow":0,"shield":0,"staff":0,"dagger":0}');
 SELECT id INTO chosen FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_a AND symbol='arrow' AND special IS NULL LIMIT 1;
 UPDATE public.dungeon_relay_cards SET zone='hand' WHERE id=chosen;
 PERFORM pg_temp.check(public.play_dungeon_relay_cards(run,ARRAY[chosen]),'normal play combines with wildcard');

 run:=pg_temp.fixture('cleric'); chosen:=pg_temp.special(run);
 SELECT count(*)/2 INTO donated FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_a AND zone='deck';
 PERFORM public.play_dungeon_relay_special(run,chosen,player_b,'transfer');
 PERFORM pg_temp.check((SELECT count(*)=55+donated FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_b AND zone='deck'),'cleric appends half deck');
 PERFORM pg_temp.check((SELECT min(pile_order)>60 FROM public.dungeon_relay_cards WHERE match_id=run AND user_id=player_a AND holder_id=player_b),'donation appended in order');
 PERFORM pg_temp.check((SELECT count(*)=120 FROM public.dungeon_relay_cards WHERE match_id=run),'donation conserves cards');

 run:=pg_temp.fixture('cleric'); chosen:=pg_temp.special(run);
 UPDATE public.dungeon_relay_players SET status='dead',died_at=now() WHERE match_id=run AND user_id=player_b;
 UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE match_id=run AND holder_id=player_b;
 SELECT count(*)/2 INTO donated FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_a AND zone='deck';
 PERFORM public.play_dungeon_relay_special(run,chosen,player_b,'transfer');
 PERFORM pg_temp.check((SELECT status='active' AND died_at IS NULL FROM public.dungeon_relay_players WHERE match_id=run AND user_id=player_b),'cleric revives');
 PERFORM pg_temp.check((SELECT count(*)=5 FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_b AND zone='hand'),'revived player draws five');
 PERFORM pg_temp.check((SELECT count(*)=donated-5 FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_b AND zone='deck'),'revived deck remainder');

 run:=pg_temp.fixture('cleric'); chosen:=pg_temp.special(run);
 UPDATE public.dungeon_relay_players SET status='dead',died_at=now() WHERE match_id=run AND user_id=player_b;
 UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE match_id=run AND holder_id=player_b;
 UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE match_id=run AND holder_id=player_a AND zone='deck' AND id NOT IN(SELECT id FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_a AND zone='deck' ORDER BY pile_order LIMIT 3);
 PERFORM public.play_dungeon_relay_special(run,chosen,player_b,'transfer');
 PERFORM pg_temp.check((SELECT count(*)=1 FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_b AND zone='hand'),'odd deck rounds down and small donation revives');
 PERFORM pg_temp.check((SELECT status='active' FROM public.dungeon_relay_players WHERE match_id=run AND user_id=player_b),'small revival stays alive');

 run:=pg_temp.fixture('cleric'); chosen:=pg_temp.special(run);
 PERFORM public.play_dungeon_relay_special(run,chosen,NULL,'draw_all');
 PERFORM pg_temp.check((SELECT count(*)=7 FROM public.dungeon_relay_cards WHERE match_id=run AND holder_id=player_b AND zone='hand'),'cleric alternative draws two');

 run:=pg_temp.fixture('wizard'); chosen:=pg_temp.special(run);
 UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE match_id=run AND holder_id=player_b AND zone='deck';
 PERFORM public.play_dungeon_relay_special(run,chosen,player_b);
 PERFORM pg_temp.check((SELECT status='dead' FROM public.dungeon_relay_players WHERE match_id=run AND user_id=player_b),'bonus draws respect exhaustion');

 run:=pg_temp.fixture('alchemist'); chosen:=pg_temp.special(run);
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_cards(%L,ARRAY[%L::uuid])',run,chosen),'use_special_card_action');
 UPDATE public.dungeon_relay_matches SET timer_frozen=true WHERE id=run;
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L)',run,chosen),'time_freeze_lockout');
 UPDATE public.dungeon_relay_matches SET timer_resume_locked_until=now()-interval '1 second' WHERE id=run;
 PERFORM public.play_dungeon_relay_special(run,chosen);
 PERFORM pg_temp.check((SELECT NOT timer_frozen AND timer_deadline IS NOT NULL FROM public.dungeon_relay_matches WHERE id=run),'special resumes timer');

 run:=pg_temp.fixture('alchemist'); chosen:=pg_temp.special(run);
 UPDATE public.dungeon_relay_matches SET timer_deadline=now()-interval '1 second' WHERE id=run;
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L)',run,chosen),'run_time_expired');
 PERFORM set_config('request.jwt.claim.sub',player_b,true);
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L)',run,chosen),'card_not_in_hand');
 PERFORM set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L)',run,chosen),'match_not_found');
 PERFORM pg_temp.reject(format('SELECT public.get_dungeon_relay_state(%L)',run),'match_not_found');
 PERFORM pg_temp.check(NOT has_function_privilege('authenticated','public.dungeon_relay_draw_exact(uuid,text,integer)','EXECUTE'),'internal draw helper protected');
 PERFORM pg_temp.check(has_function_privilege('authenticated','public.play_dungeon_relay_special(uuid,uuid,text,text,jsonb)','EXECUTE'),'special command available to authenticated players');

 -- The final boss special survives timeout during its animation and advances to a win.
 run:=pg_temp.fixture('champion'); chosen:=pg_temp.special(run);
 UPDATE public.dungeon_relay_matches SET dungeon_position=11 WHERE id=run;
 PERFORM pg_temp.check(public.play_dungeon_relay_special(run,chosen),'final boss defeated');
 UPDATE public.dungeon_relay_matches SET timer_deadline=now()-interval '1 second',resolve_at=now() WHERE id=run;
 PERFORM pg_temp.check(NOT public.expire_dungeon_relay_timer(run),'boss resolution protected from timeout');
 PERFORM public.advance_dungeon_relay_round(run);
 PERFORM pg_temp.check((SELECT status='won' FROM public.dungeon_relay_matches WHERE id=run),'final victory');
 PERFORM pg_temp.check((SELECT zone='graveyard' FROM public.dungeon_relay_cards WHERE id=chosen),'played special spent on advance');

 -- Giving cards invalidates a prior confirmation; new multi-symbol cards must be handled.
 run:=pg_temp.fixture('wizard','event','discard_multis'); chosen:=pg_temp.special(run);
 INSERT INTO public.dungeon_relay_event_confirmations VALUES(run,1,player_b,now());
 PERFORM public.play_dungeon_relay_special(run,chosen,player_b);
 PERFORM pg_temp.check(NOT EXISTS(SELECT 1 FROM public.dungeon_relay_event_confirmations WHERE match_id=run AND user_id=player_b),'gift reopens recipient confirmation');
 run:=pg_temp.fixture('alchemist','event','discard_shields'); chosen:=pg_temp.special(run);
 PERFORM pg_temp.reject(format('SELECT public.confirm_dungeon_relay_event(%L)',run),'eligible_cards_remain');
 PERFORM public.discard_dungeon_relay_event_cards(run,ARRAY[chosen]);
 PERFORM pg_temp.check((SELECT zone='event_discard' FROM public.dungeon_relay_cards WHERE id=chosen),'prismatic card can be discarded to shield event');

 -- Class powers still accept special cards as their discard cost.
 run:=pg_temp.fixture('alchemist'); chosen:=pg_temp.special(run);
 PERFORM public.use_dungeon_relay_class_power(run,ARRAY[chosen],NULL);
 PERFORM pg_temp.check((SELECT zone='discard' FROM public.dungeon_relay_cards WHERE id=chosen),'special can pay class power cost');

 run:=pg_temp.fixture('cleric'); chosen:=pg_temp.special(run);
 UPDATE public.dungeon_relay_cards SET zone='graveyard' WHERE match_id=run AND holder_id=player_a AND zone='deck';
 PERFORM pg_temp.reject(format('SELECT public.play_dungeon_relay_special(%L,%L,%L,%L)',run,chosen,player_b,'transfer'),'not_enough_deck_to_share');
 PERFORM pg_temp.check((SELECT zone='hand' FROM public.dungeon_relay_cards WHERE id=chosen),'invalid donation unspent');
 RAISE NOTICE 'Dungeon Relay special-card SQL assertions passed';
END $$;
ROLLBACK;
