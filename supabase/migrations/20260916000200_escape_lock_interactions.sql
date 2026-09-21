-- Private mechanical state and authored hints never enter Realtime payloads.
ALTER TABLE public.escape_sessions
  ADD COLUMN mechanisms jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN hints jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN hint_count integer NOT NULL DEFAULT 0 CHECK (hint_count >= 0),
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN party_name text NOT NULL DEFAULT 'Adventuring party';
CREATE INDEX escape_completed_blueprint_idx ON public.escape_sessions(blueprint_id, completed_at) WHERE completed_at IS NOT NULL;

ALTER FUNCTION public.escape_validate(jsonb) RENAME TO escape_validate_v1;
CREATE FUNCTION public.escape_validate(p_definition jsonb) RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n jsonb; h jsonb;
BEGIN
  PERFORM public.escape_validate_v1(p_definition);
  FOR n IN SELECT value FROM jsonb_array_elements(p_definition->'nodes') LOOP
    IF n ? 'pickable' AND jsonb_typeof(n->'pickable') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid pickable setting.'; END IF;
    IF n ? 'pickDifficulty' AND (jsonb_typeof(n->'pickDifficulty') IS DISTINCT FROM 'string' OR n->>'pickDifficulty' NOT IN ('Training','Standard','Expert','Master')) THEN RAISE EXCEPTION 'Invalid picking difficulty.'; END IF;
    IF n ? 'forcePolicy' AND (jsonb_typeof(n->'forcePolicy') IS DISTINCT FROM 'string' OR n->>'forcePolicy' NOT IN ('blocked','allowed','reinforced')) THEN RAISE EXCEPTION 'Invalid force policy.'; END IF;
    IF n ? 'forceConsequence' AND (jsonb_typeof(n->'forceConsequence') IS DISTINCT FROM 'string' OR length(n->>'forceConsequence') > 2000) THEN RAISE EXCEPTION 'Invalid force consequence.'; END IF;
    IF n ? 'hints' THEN
      IF jsonb_typeof(n->'hints') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Hints must be an array.'; END IF;
      IF jsonb_array_length(n->'hints') > 50 THEN RAISE EXCEPTION 'Use up to 50 authored hints per clue.'; END IF;
      FOR h IN SELECT value FROM jsonb_array_elements(n->'hints') LOOP
        IF jsonb_typeof(h) IS DISTINCT FROM 'string' OR length(btrim(h#>>'{}')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Hints must contain 1 to 2000 characters.'; END IF;
      END LOOP;
    END IF;
  END LOOP;
END; $$;

ALTER FUNCTION public.escape_snapshot(uuid) RENAME TO escape_snapshot_v1;
CREATE FUNCTION public.escape_snapshot(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; s public.escape_sessions; nodes jsonb;
BEGIN
  result := public.escape_snapshot_v1(p_id); -- authenticates membership and projects safe fields
  SELECT * INTO STRICT s FROM public.escape_sessions WHERE id = p_id;
  SELECT coalesce(jsonb_agg(v || jsonb_build_object(
    'needsItems', (v->>'needsItems')::boolean AND NOT coalesce((m->>'picked')::boolean,false),
    'keyhole', jsonb_array_length(n->'keyIds') > 0,
    'pickable', jsonb_array_length(n->'keyIds') > 0 AND coalesce((n->>'pickable')::boolean,true),
    'pickDifficulty', coalesce(n->>'pickDifficulty','Standard'),
    'forcePolicy', coalesce(n->>'forcePolicy','blocked'),
    'mechanism', jsonb_build_object(
      'failures', coalesce((m->>'failures')::integer,0), 'jammed', coalesce((m->>'failures')::integer,0) >= 3,
      'picked', coalesce((m->>'picked')::boolean,false), 'health', coalesce((m->>'health')::numeric,100),
      'rotation', coalesce((m->>'rotation')::numeric,0), 'angle', coalesce((m->>'angle')::numeric,0),
      'occupied', coalesce((m->>'leaseUntil')::timestamptz > now(),false),
      'canControl', coalesce(m->>'picker' = auth.uid()::text AND (m->>'leaseUntil')::timestamptz > now(),false),
      'forcePending', coalesce((m->>'forcePending')::boolean,false), 'forceAttempts', coalesce((m->>'forceAttempts')::integer,0)
    )
  )), '[]') INTO nodes
  FROM jsonb_array_elements(result->'nodes') v
  JOIN jsonb_array_elements(s.definition->'nodes') n ON n->>'id' = v->>'id'
  CROSS JOIN LATERAL (SELECT coalesce(s.mechanisms->(v->>'id'),'{}') AS m) state;
  RETURN result || jsonb_build_object('nodes',nodes,'hints',s.hints,'hintCount',s.hint_count,'leaderboardEligible',s.hint_count <= 3,'partyName',s.party_name);
END; $$;

CREATE FUNCTION public.escape_leaderboard(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.escape_sessions; result jsonb;
BEGIN
  PERFORM public.escape_require_user();
  IF NOT public.escape_can_read(p_id) THEN RAISE EXCEPTION 'Room not found or access denied.'; END IF;
  SELECT * INTO STRICT s FROM public.escape_sessions WHERE id = p_id;
  SELECT coalesce(jsonb_agg(row_data ORDER BY seconds, hint_count, completed_at, id),'[]') INTO result FROM (
    SELECT id, extract(epoch FROM completed_at - created_at) AS seconds, hint_count, completed_at,
      jsonb_build_object('partyName',party_name,'seconds',extract(epoch FROM completed_at-created_at),'hintCount',hint_count,'completedAt',completed_at) AS row_data
    FROM public.escape_sessions WHERE blueprint_id = s.blueprint_id AND definition = s.definition
      AND status = 'completed' AND completed_at IS NOT NULL AND hint_count <= 3
    ORDER BY extract(epoch FROM completed_at-created_at), hint_count, completed_at, id LIMIT 20
  ) ranked;
  RETURN result;
END; $$;

ALTER FUNCTION public.escape_command(uuid,integer,jsonb) RENAME TO escape_command_v1;
CREATE FUNCTION public.escape_command(p_id uuid, p_revision integer, p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := public.escape_require_user(); s public.escape_sessions; n jsonb; m jsonb; h jsonb; entry jsonb;
  action text := p_command->>'type'; node_id text := p_command->>'nodeId'; gm boolean; key_id text;
  title text := 'Session'; hint_index integer; hint_text text; found_hint boolean := false; updated_hints jsonb := '[]';
  failures integer; angle numeric; miss numeric; tolerance numeric; speed numeric; bind numeric; target numeric; dt numeric;
  health numeric; rotation numeric; secret integer; clock_at timestamptz := clock_timestamp(); opened boolean := false;
BEGIN
  IF NOT public.escape_can_read(p_id) THEN RAISE EXCEPTION 'Room not found or access denied.'; END IF;
  SELECT * INTO STRICT s FROM public.escape_sessions WHERE id = p_id FOR UPDATE;
  IF s.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'The party made progress. Refresh and try again.'; END IF;
  gm := s.gm_id = uid AND public.is_site_admin(uid::text);
  IF action IN ('reveal','mark_used','pause','resume') THEN
    PERFORM public.escape_command_v1(p_id,p_revision,p_command);
    UPDATE public.escape_sessions SET completed_at = clock_at WHERE id = p_id AND status = 'completed' AND completed_at IS NULL;
    RETURN public.escape_snapshot(p_id);
  END IF;
  IF action IS NULL OR action NOT IN ('unlock','start_pick','pick_turn','release_pick','force_attempt','resolve_force','request_hint','answer_hint','set_party_name') THEN RAISE EXCEPTION 'Unknown command.'; END IF;
  IF action IN ('resolve_force','answer_hint','set_party_name') AND NOT gm THEN RAISE EXCEPTION 'Only the puzzle master can do that.'; END IF;
  IF s.status = 'completed' THEN RAISE EXCEPTION 'This room is complete.'; END IF;
  IF s.status <> 'active' AND action NOT IN ('answer_hint','set_party_name','release_pick') THEN RAISE EXCEPTION 'The puzzle master has paused this room.'; END IF;

  IF action = 'set_party_name' THEN
    IF jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'name')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Party names must contain 1 to 80 characters.'; END IF;
    s.party_name := btrim(p_command->>'name'); title := s.party_name;
  ELSIF action = 'answer_hint' THEN
    IF jsonb_typeof(p_command->'text') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'text')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Hints must contain 1 to 2000 characters.'; END IF;
    FOR h IN SELECT value FROM jsonb_array_elements(s.hints) LOOP
      IF h->>'id' = p_command->>'hintId' AND h->>'text' IS NULL THEN
        h := h || jsonb_build_object('text',btrim(p_command->>'text')); found_hint := true;
      END IF;
      updated_hints := updated_hints || jsonb_build_array(h);
    END LOOP;
    IF NOT found_hint THEN RAISE EXCEPTION 'Pending hint not found.'; END IF;
    s.hints := updated_hints; title := 'The puzzle master answered a hint';
  ELSIF action = 'request_hint' THEN
    IF node_id IS NOT NULL THEN
      SELECT value INTO n FROM jsonb_array_elements(s.definition->'nodes') WHERE value->>'id' = node_id;
      IF n IS NULL OR coalesce(s.states->>node_id,'hidden') = 'hidden' THEN RAISE EXCEPTION 'Clue unavailable.'; END IF;
      title := n->>'title';
      SELECT count(*) INTO hint_index FROM jsonb_array_elements(s.hints) q WHERE q->>'nodeId' = node_id;
      hint_text := n->'hints'->>hint_index;
    ELSE title := 'The whole room'; END IF;
    s.hint_count := s.hint_count + 1;
    s.hints := s.hints || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'nodeId',node_id,'title',title,'text',hint_text,'requestedAt',clock_at,'number',s.hint_count));
  ELSE
    SELECT value INTO n FROM jsonb_array_elements(s.definition->'nodes') WHERE value->>'id' = node_id;
    IF n IS NULL OR coalesce(s.states->>node_id,'hidden') <> 'known' THEN RAISE EXCEPTION 'Clue unavailable or already used.'; END IF;
    IF n->>'kind' NOT IN ('container','room','puzzle','treasure') OR NOT public.escape_ready(n,s.states) THEN RAISE EXCEPTION 'This cannot be opened yet.'; END IF;
    title := n->>'title'; m := coalesce(s.mechanisms->node_id,'{}'); failures := coalesce((m->>'failures')::integer,0);
    IF action = 'unlock' THEN
      IF jsonb_typeof(p_command->'code') IS DISTINCT FROM 'string' OR length(p_command->>'code') > 120 OR jsonb_typeof(p_command->'itemIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid attempt.'; END IF;
      IF jsonb_array_length(p_command->'itemIds') > 100 THEN RAISE EXCEPTION 'Invalid attempt.'; END IF;
      IF n->>'code' <> '' AND lower(btrim(n->>'code')) <> lower(btrim(p_command->>'code')) THEN RAISE EXCEPTION 'The lock does not open. Check your code and items.'; END IF;
      IF NOT coalesce((m->>'picked')::boolean,false) THEN
        FOR key_id IN SELECT jsonb_array_elements_text(n->'keyIds') LOOP
          IF coalesce(s.states->>key_id,'hidden') NOT IN ('known','used') OR NOT ((p_command->'itemIds') ? key_id) THEN RAISE EXCEPTION 'The lock does not open. Check your code and items.'; END IF;
        END LOOP;
        FOR key_id IN SELECT jsonb_array_elements_text(n->'keyIds') LOOP s.states := jsonb_set(s.states,ARRAY[key_id],'"used"'); END LOOP;
      END IF;
      opened := true;
    ELSIF action IN ('start_pick','pick_turn','release_pick') THEN
      IF jsonb_array_length(n->'keyIds') = 0 OR NOT coalesce((n->>'pickable')::boolean,true) THEN RAISE EXCEPTION 'This lock cannot be picked.'; END IF;
      IF failures >= 3 THEN RAISE EXCEPTION 'The mechanism is jammed. Use the actual key.'; END IF;
      IF coalesce((m->>'picked')::boolean,false) THEN RAISE EXCEPTION 'The key mechanism is already picked. Enter the code.'; END IF;
      IF action = 'start_pick' THEN
        IF m->>'picker' <> uid::text AND (m->>'leaseUntil')::timestamptz > clock_at THEN RAISE EXCEPTION 'Another player is picking this lock.'; END IF;
        secret := coalesce((m->>'secret')::integer, get_byte(uuid_send(gen_random_uuid()),0) % 149 - 74);
        m := m || jsonb_build_object('secret',secret,'picker',uid,'leaseUntil',clock_at + interval '15 seconds','lastTick',clock_at,'rotation',0);
      ELSE
        IF m->>'picker' IS DISTINCT FROM uid::text OR coalesce((m->>'leaseUntil')::timestamptz <= clock_at,true) THEN RAISE EXCEPTION 'Take control of the lock before applying tension.'; END IF;
        IF action = 'release_pick' THEN
          m := m || jsonb_build_object('rotation',0,'picker',NULL,'leaseUntil',NULL,'lastTick',clock_at);
        ELSE
          IF jsonb_typeof(p_command->'angle') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid pick angle.'; END IF;
          angle := (p_command->>'angle')::numeric;
          IF angle < -74 OR angle > 74 THEN RAISE EXCEPTION 'Invalid pick angle.'; END IF;
          dt := greatest(0,least(0.25,extract(epoch FROM clock_at - (m->>'lastTick')::timestamptz)));
          tolerance := CASE coalesce(n->>'pickDifficulty','Standard') WHEN 'Training' THEN 18 WHEN 'Expert' THEN 8 WHEN 'Master' THEN 5 ELSE 12 END;
          speed := CASE coalesce(n->>'pickDifficulty','Standard') WHEN 'Training' THEN 92 WHEN 'Expert' THEN 68 WHEN 'Master' THEN 58 ELSE 80 END;
          bind := CASE coalesce(n->>'pickDifficulty','Standard') WHEN 'Training' THEN 82 WHEN 'Expert' THEN 46 WHEN 'Master' THEN 32 ELSE 62 END;
          miss := abs(angle - (m->>'secret')::numeric); health := coalesce((m->>'health')::numeric,100); rotation := coalesce((m->>'rotation')::numeric,0);
          IF miss <= tolerance THEN
            rotation := least(92,rotation + speed * dt);
            IF rotation >= 91 THEN
              m := m || jsonb_build_object('picked',true,'picker',NULL,'leaseUntil',NULL);
              opened := n->>'code' = ''; action := 'picked';
            END IF;
          ELSE
            target := greatest(9,least(bind,bind * greatest(0.12,greatest(0,1-miss/(tolerance*4.5)))));
            rotation := CASE WHEN rotation < target THEN least(target,rotation + speed * 1.35 * dt) ELSE greatest(target,rotation - speed * 1.35 * dt) END;
            IF rotation >= target - 0.75 THEN health := greatest(0,health - (26 + miss * 0.65) * dt); END IF;
            IF health <= 0 THEN
              failures := failures + 1; health := 100; rotation := 0;
              m := m || jsonb_build_object('failures',failures,'picker',NULL,'leaseUntil',NULL);
              action := CASE WHEN failures >= 3 THEN 'lock_jammed' ELSE 'pick_broken' END;
            END IF;
          END IF;
          m := m || jsonb_build_object('health',health,'rotation',rotation,'angle',angle,'lastTick',clock_at);
          IF action = 'pick_turn' THEN m := m || jsonb_build_object('leaseUntil',clock_at + interval '15 seconds'); END IF;
        END IF;
      END IF;
    ELSIF action = 'force_attempt' THEN
      IF coalesce((m->>'forcePending')::boolean,false) THEN RAISE EXCEPTION 'The GM is already resolving a forced-entry attempt.'; END IF;
      m := m || jsonb_build_object('forceAttempts',coalesce((m->>'forceAttempts')::integer,0)+1,'forcePending',coalesce(n->>'forcePolicy','blocked') = 'allowed');
      title := title || CASE coalesce(n->>'forcePolicy','blocked') WHEN 'allowed' THEN ': forced entry awaiting GM ruling' WHEN 'reinforced' THEN ': magical reinforcement blocks forced entry' ELSE ': embedded mechanism cannot be broken off' END;
      IF coalesce(n->>'forceConsequence','') <> '' THEN title := title || ' — ' || (n->>'forceConsequence'); END IF;
    ELSIF action = 'resolve_force' THEN
      IF coalesce(n->>'forcePolicy','blocked') <> 'allowed' OR NOT coalesce((m->>'forcePending')::boolean,false) THEN RAISE EXCEPTION 'No eligible forced-entry attempt is pending.'; END IF;
      IF jsonb_typeof(p_command->'success') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid force result.'; END IF;
      opened := (p_command->>'success')::boolean; m := m || jsonb_build_object('forcePending',false);
      title := title || CASE WHEN opened THEN ': forced open' ELSE ': resisted forced entry' END;
    END IF;
    IF opened THEN
      s.states := jsonb_set(s.states,ARRAY[node_id],'"used"');
      m := m || jsonb_build_object('picker',NULL,'leaseUntil',NULL,'forcePending',false);
    END IF;
    s.mechanisms := jsonb_set(s.mechanisms,ARRAY[node_id],m);
    s.states := public.escape_reveal_ready(s.definition,s.states);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.definition->'nodes') v WHERE v->>'kind' = 'treasure' AND coalesce(s.states->>(v->>'id'),'hidden') <> 'used') THEN s.status := 'completed'; s.completed_at := clock_at; END IF;
  END IF;
  IF action NOT IN ('pick_turn','start_pick','release_pick') THEN
    entry := jsonb_build_object('action',action,'title',title,'at',clock_at);
    s.history := s.history || jsonb_build_array(entry);
    SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]') INTO s.history FROM jsonb_array_elements(s.history) WITH ORDINALITY e(value,ordinal) WHERE ordinal > jsonb_array_length(s.history)-60;
  END IF;
  UPDATE public.escape_sessions SET states=s.states, mechanisms=s.mechanisms, hints=s.hints, hint_count=s.hint_count, party_name=s.party_name, completed_at=s.completed_at, status=s.status, history=s.history, revision=revision+1 WHERE id=p_id;
  UPDATE public.escape_updates SET revision=revision+1 WHERE session_id=p_id;
  RETURN public.escape_snapshot(p_id);
END; $$;

REVOKE ALL ON FUNCTION public.escape_validate_v1(jsonb), public.escape_validate(jsonb), public.escape_snapshot_v1(uuid), public.escape_snapshot(uuid), public.escape_command_v1(uuid,integer,jsonb), public.escape_command(uuid,integer,jsonb), public.escape_leaderboard(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escape_snapshot(uuid), public.escape_command(uuid,integer,jsonb), public.escape_leaderboard(uuid) TO authenticated;
