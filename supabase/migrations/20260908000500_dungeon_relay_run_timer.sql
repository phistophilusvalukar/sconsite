/* One five-minute run clock with Wizard freeze awareness and a short resume lockout. */

ALTER TABLE public.dungeon_relay_matches
  ADD COLUMN timer_resume_locked_until timestamptz;
ALTER TABLE public.dungeon_relay_matches DROP CONSTRAINT IF EXISTS dungeon_relay_matches_timer_remaining_seconds_check;
ALTER TABLE public.dungeon_relay_matches ALTER COLUMN timer_remaining_seconds SET DEFAULT 300;
ALTER TABLE public.dungeon_relay_matches ADD CONSTRAINT dungeon_relay_matches_timer_remaining_seconds_check
  CHECK (timer_remaining_seconds BETWEEN 0 AND 300);
ALTER TABLE public.dungeon_relay_matches ALTER COLUMN timer_deadline SET DEFAULT (now()+interval '5 minutes');

-- Existing prototype runs receive a clean five-minute clock when this rule is introduced.
UPDATE public.dungeon_relay_matches SET
  timer_deadline=now()+interval '5 minutes',timer_frozen=false,timer_remaining_seconds=300,timer_resume_locked_until=NULL
WHERE status='active';

DROP TRIGGER IF EXISTS reset_dungeon_relay_timer_on_round_trigger ON public.dungeon_relay_matches;
DROP FUNCTION IF EXISTS public.reset_dungeon_relay_timer_on_round();

CREATE OR REPLACE FUNCTION public.prepare_dungeon_relay_timer_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT OLD.timer_frozen AND NEW.timer_frozen THEN
    NEW.timer_remaining_seconds:=greatest(0,least(300,ceil(extract(epoch FROM OLD.timer_deadline-now()))::integer));
    NEW.timer_deadline:=NULL;
    NEW.timer_resume_locked_until:=now()+interval '3 seconds';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prepare_dungeon_relay_timer_freeze_trigger
BEFORE UPDATE OF timer_frozen ON public.dungeon_relay_matches
FOR EACH ROW EXECUTE FUNCTION public.prepare_dungeon_relay_timer_freeze();

CREATE OR REPLACE FUNCTION public.guard_dungeon_relay_run_timer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE run public.dungeon_relay_matches%ROWTYPE;
BEGIN
  SELECT * INTO run FROM public.dungeon_relay_matches WHERE id=NEW.match_id;
  IF run.status='active' AND NOT run.timer_frozen AND run.timer_deadline IS NOT NULL AND now()>=run.timer_deadline
    AND NOT (run.dungeon_position=11 AND run.phase='resolving') THEN RAISE EXCEPTION 'run_time_expired'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_dungeon_relay_card_timer_trigger BEFORE UPDATE OF zone ON public.dungeon_relay_cards
FOR EACH ROW WHEN (OLD.zone='hand' AND NEW.zone IN('played','discard','event_discard')) EXECUTE FUNCTION public.guard_dungeon_relay_run_timer();
CREATE TRIGGER guard_dungeon_relay_vote_timer_trigger BEFORE INSERT OR UPDATE ON public.dungeon_relay_event_votes
FOR EACH ROW EXECUTE FUNCTION public.guard_dungeon_relay_run_timer();
CREATE TRIGGER guard_dungeon_relay_confirmation_timer_trigger BEFORE INSERT ON public.dungeon_relay_event_confirmations
FOR EACH ROW EXECUTE FUNCTION public.guard_dungeon_relay_run_timer();
CREATE TRIGGER guard_dungeon_relay_exclusion_timer_trigger BEFORE INSERT ON public.dungeon_relay_event_exclusions
FOR EACH ROW EXECUTE FUNCTION public.guard_dungeon_relay_run_timer();

CREATE OR REPLACE FUNCTION public.resume_dungeon_relay_timer_on_play()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE locked_until timestamptz;
BEGIN
  IF OLD.zone='hand' AND NEW.zone='played' THEN
    SELECT timer_resume_locked_until INTO locked_until FROM public.dungeon_relay_matches WHERE id=NEW.match_id AND timer_frozen;
    IF locked_until IS NOT NULL AND now()<locked_until THEN RAISE EXCEPTION 'time_freeze_lockout'; END IF;
    UPDATE public.dungeon_relay_matches SET
      timer_deadline=now()+make_interval(secs=>timer_remaining_seconds),timer_frozen=false,timer_resume_locked_until=NULL
    WHERE id=NEW.match_id AND timer_frozen;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.expire_dungeon_relay_timer(p_match_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_match public.dungeon_relay_matches%ROWTYPE;
BEGIN
  SELECT * INTO current_match FROM public.dungeon_relay_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_dungeon_relay_participant(p_match_id) THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='42501'; END IF;
  IF current_match.status<>'active' OR current_match.timer_frozen OR current_match.timer_deadline IS NULL OR now()<current_match.timer_deadline THEN RETURN false; END IF;
  -- Once the boss has been matched, its resolution animation cannot turn a win into a timeout.
  IF current_match.dungeon_position=11 AND current_match.phase='resolving' THEN RETURN false; END IF;
  UPDATE public.dungeon_relay_matches SET status='lost',phase='complete',ended_at=now(),resolve_at=NULL,timer_remaining_seconds=0 WHERE id=p_match_id;
  UPDATE public.dungeon_relay_updates SET revision=current_match.revision+1,updated_at=now() WHERE match_id=p_match_id;
  UPDATE public.dungeon_relay_matches SET revision=revision+1 WHERE id=p_match_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.expire_dungeon_relay_timer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_dungeon_relay_timer(uuid) TO authenticated;

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
    'self',(SELECT jsonb_build_object('userId',player.user_id,'status',player.status,'hand',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'symbol',card.symbol,'symbols',card.symbol_count) ORDER BY card.pile_order,card.id) FROM public.dungeon_relay_cards card WHERE card.match_id=match.id AND card.holder_id=player.user_id AND card.zone='hand'),'[]'::jsonb)) FROM public.dungeon_relay_players player WHERE player.match_id=match.id AND player.user_id=auth.uid()::text),
    'playedCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'playedOrder',card.played_sequence) ORDER BY card.played_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='played' AND card.played_round=match.dungeon_position),'[]'::jsonb),
    'eventDiscardCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'playedOrder',0) ORDER BY card.discarded_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='event_discard' AND card.played_round=match.dungeon_position),'[]'::jsonb),
    'discardCards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',card.id,'userId',owner.user_id,'username',profile.username,'color',public.dungeon_relay_class_color(owner.class_id),'symbol',card.symbol,'symbols',card.symbol_count,'playedOrder',COALESCE(card.discarded_sequence,0)) ORDER BY owner.seat,card.discarded_sequence,card.id) FROM public.dungeon_relay_cards card JOIN public.dungeon_relay_players owner ON owner.match_id=card.match_id AND owner.user_id=card.holder_id JOIN public.users profile ON profile.auth_user_id=owner.user_id WHERE card.match_id=match.id AND card.zone='discard'),'[]'::jsonb)
  ) INTO result FROM public.dungeon_relay_matches match JOIN public.dungeon_relay_dungeons dungeon ON dungeon.match_id=match.id AND dungeon.position=match.dungeon_position WHERE match.id=p_match_id;
  IF result IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;
  RETURN result;
END $$;
