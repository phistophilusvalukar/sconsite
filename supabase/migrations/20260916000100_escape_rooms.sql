-- Escape room definitions and canonical sessions are accessible only through RPCs.
-- Realtime publishes revision notices, never protected puzzle JSON.
ALTER TABLE public.site_pages DROP CONSTRAINT IF EXISTS site_pages_known_page_key;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_known_page_key CHECK (
  page_key IN (
    'home', 'about', 'lore', 'characters', 'citizens', 'guilds', 'schedule', 'games',
    'marketplace', 'arcana', 'underhaul-contracts', 'arcane-locks', 'broken-seals',
    'citadel-tactics', 'tactical-puzzles', 'campaign-objectives', 'multiplayer-lobby',
    'ancient-terminal', 'event', 'skill-checks', 'news', 'escape-rooms'
  )
);
INSERT INTO public.site_pages(page_key, is_enabled) VALUES ('escape-rooms', true) ON CONFLICT (page_key) DO NOTHING;

CREATE TABLE public.escape_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  definition jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.escape_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gm_id uuid NOT NULL REFERENCES auth.users(id),
  blueprint_id uuid NOT NULL REFERENCES public.escape_blueprints(id),
  definition jsonb NOT NULL,
  states jsonb NOT NULL DEFAULT '{}',
  join_code text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.escape_members (
  session_id uuid NOT NULL REFERENCES public.escape_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);
CREATE TABLE public.escape_updates (
  session_id uuid PRIMARY KEY REFERENCES public.escape_sessions(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1
);
ALTER TABLE public.escape_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escape_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escape_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escape_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.escape_blueprints, public.escape_sessions, public.escape_members, public.escape_updates FROM anon, authenticated;
GRANT SELECT ON public.escape_updates TO authenticated;

CREATE FUNCTION public.escape_require_user() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_user_banned(auth.uid()::text) THEN RAISE EXCEPTION 'Sign in with an active account.'; END IF;
  RETURN auth.uid();
END; $$;
CREATE FUNCTION public.escape_can_read(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_user_banned(auth.uid()::text) AND (
    EXISTS (SELECT 1 FROM public.escape_sessions WHERE id = p_id AND gm_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.escape_members WHERE session_id = p_id AND user_id = auth.uid())
  );
$$;
CREATE POLICY escape_update_read ON public.escape_updates FOR SELECT TO authenticated USING (public.escape_can_read(session_id));

CREATE FUNCTION public.escape_validate(p_definition jsonb) RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n jsonb; r jsonb; nodes jsonb; ids text[]; visited text[] := '{}'; next_ids text[]; k text;
BEGIN
  IF jsonb_typeof(p_definition) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_definition->'title') IS DISTINCT FROM 'string'
    OR length(btrim(p_definition->>'title')) NOT BETWEEN 1 AND 120
    OR jsonb_typeof(p_definition->'description') IS DISTINCT FROM 'string'
    OR length(p_definition->>'description') > 2000
    OR jsonb_typeof(p_definition->'nodes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid blueprint.'; END IF;
  nodes := p_definition->'nodes';
  IF jsonb_array_length(nodes) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Use between 1 and 100 nodes.'; END IF;
  SELECT array_agg(value->>'id') INTO ids FROM jsonb_array_elements(nodes);
  IF (SELECT count(DISTINCT value) FROM unnest(ids) value) <> cardinality(ids) THEN RAISE EXCEPTION 'Node IDs must be unique.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(nodes) LOOP
    FOREACH k IN ARRAY ARRAY['id','title','kind','prop','location','text','backText','gmNotes','reveal','gate','code'] LOOP
      IF jsonb_typeof(n->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Missing or invalid node field: %', k; END IF;
    END LOOP;
    IF n->>'id' !~ '^[a-zA-Z0-9_-]{1,80}$' OR length(btrim(n->>'title')) NOT BETWEEN 1 AND 120
      OR length(n->>'location') > 200 OR length(n->>'text') > 8000 OR length(n->>'backText') > 8000 OR length(n->>'gmNotes') > 8000
      OR length(n->>'code') > 120 OR n->>'kind' NOT IN ('clue','item','container','room','puzzle','treasure')
      OR n->>'prop' NOT IN ('paper','book','key','rod','chest','door','crystal')
      OR n->>'reveal' NOT IN ('manual','automatic') OR n->>'gate' NOT IN ('all','any')
      OR jsonb_typeof(n->'requires') IS DISTINCT FROM 'array' OR jsonb_typeof(n->'keyIds') IS DISTINCT FROM 'array'
      THEN RAISE EXCEPTION 'Invalid node: %', n->>'title'; END IF;
    IF jsonb_array_length(n->'requires') > 100 OR jsonb_array_length(n->'keyIds') > 100 THEN RAISE EXCEPTION 'Too many prerequisites.'; END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(n->'requires') LOOP
      IF jsonb_typeof(r->'nodeId') IS DISTINCT FROM 'string' OR jsonb_typeof(r->'state') IS DISTINCT FROM 'string'
        OR NOT ((r->>'nodeId') = ANY(ids)) OR r->>'nodeId' = n->>'id' OR r->>'state' NOT IN ('known','used')
        THEN RAISE EXCEPTION 'Invalid prerequisite.'; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT value->>'nodeId') FROM jsonb_array_elements(n->'requires')) <> jsonb_array_length(n->'requires')
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(n->'keyIds')) <> jsonb_array_length(n->'keyIds') THEN RAISE EXCEPTION 'Duplicate prerequisite or key.'; END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(n->'keyIds') LOOP
      IF jsonb_typeof(r) IS DISTINCT FROM 'string' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(nodes) v WHERE v->>'id' = r#>>'{}' AND v->>'kind' = 'item' AND v->>'id' <> n->>'id') THEN RAISE EXCEPTION 'Keys must reference other item nodes.'; END IF;
    END LOOP;
    IF n->>'kind' IN ('clue','item') AND (n->>'code' <> '' OR jsonb_array_length(n->'keyIds') > 0) THEN RAISE EXCEPTION 'Only locks may require answers or items.'; END IF;
  END LOOP;
  -- Topological validation includes required-item dependencies to reject deadlocks.
  LOOP
    SELECT array_agg(v->>'id') INTO next_ids FROM jsonb_array_elements(nodes) v
    WHERE NOT ((v->>'id') = ANY(visited))
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'requires') dep WHERE NOT ((dep->>'nodeId') = ANY(visited)))
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v->'keyIds') dep WHERE NOT (dep = ANY(visited)));
    EXIT WHEN next_ids IS NULL;
    visited := visited || next_ids;
  END LOOP;
  IF cardinality(visited) <> cardinality(ids) THEN RAISE EXCEPTION 'The clue path contains a cycle.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(nodes) v WHERE v->>'kind' = 'treasure') THEN RAISE EXCEPTION 'Add a treasure node to define the ending.'; END IF;
END; $$;

CREATE FUNCTION public.escape_ready(p_node jsonb, p_states jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN jsonb_array_length(p_node->'requires') = 0 THEN true
    WHEN p_node->>'gate' = 'any' THEN coalesce(bool_or(CASE WHEN r->>'state' = 'used' THEN p_states->>(r->>'nodeId') = 'used' ELSE p_states->>(r->>'nodeId') IN ('known','used') END), false)
    ELSE coalesce(bool_and(coalesce(CASE WHEN r->>'state' = 'used' THEN p_states->>(r->>'nodeId') = 'used' ELSE p_states->>(r->>'nodeId') IN ('known','used') END, false)), false) END
  FROM jsonb_array_elements(p_node->'requires') r;
$$;
CREATE FUNCTION public.escape_reveal_ready(p_definition jsonb, p_states jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE n jsonb; changed boolean;
BEGIN
  LOOP
    changed := false;
    FOR n IN SELECT value FROM jsonb_array_elements(p_definition->'nodes') LOOP
      IF coalesce(p_states->>(n->>'id'), 'hidden') = 'hidden' AND n->>'reveal' = 'automatic' AND public.escape_ready(n, p_states) THEN
        p_states := jsonb_set(p_states, ARRAY[n->>'id'], '"known"'); changed := true;
      END IF;
    END LOOP;
    EXIT WHEN NOT changed;
  END LOOP;
  RETURN p_states;
END; $$;

CREATE FUNCTION public.escape_snapshot(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.escape_sessions; result jsonb; visible jsonb; gm boolean;
BEGIN
  PERFORM public.escape_require_user();
  IF NOT public.escape_can_read(p_id) THEN RAISE EXCEPTION 'Room not found or access denied.'; END IF;
  SELECT * INTO STRICT s FROM public.escape_sessions WHERE id = p_id;
  gm := s.gm_id = auth.uid();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', n->>'id', 'title', n->>'title', 'kind', n->>'kind', 'prop', n->>'prop', 'location', n->>'location',
    'text', n->>'text', 'backText', n->>'backText', 'status', s.states->>(n->>'id'),
    'needsCode', n->>'code' <> '', 'needsItems', jsonb_array_length(n->'keyIds') > 0
  )), '[]') INTO visible FROM jsonb_array_elements(s.definition->'nodes') n WHERE s.states->>(n->>'id') IN ('known','used');
  result := jsonb_build_object('id', s.id, 'title', s.definition->>'title', 'description', s.definition->>'description',
    'revision', s.revision, 'status', s.status, 'isGm', gm, 'nodes', visible,
    'memberCount', (SELECT count(*) FROM public.escape_members WHERE session_id = s.id), 'history', s.history);
  IF gm THEN result := result || jsonb_build_object('definition', s.definition, 'states', s.states, 'joinCode', s.join_code); END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.escape_library() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := public.escape_require_user();
BEGIN
  RETURN jsonb_build_object(
    'blueprints', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'definition', definition, 'revision', revision) ORDER BY updated_at DESC), '[]') FROM public.escape_blueprints WHERE owner_id = uid AND public.is_site_admin(uid::text)),
    'sessions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', definition->>'title', 'status', status, 'isGm', gm_id = uid) ORDER BY created_at DESC), '[]') FROM public.escape_sessions WHERE public.escape_can_read(id))
  );
END; $$;

CREATE FUNCTION public.escape_save_blueprint(p_id uuid, p_definition jsonb, p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := public.escape_require_user(); b public.escape_blueprints;
BEGIN
  IF NOT public.is_site_admin(uid::text) THEN RAISE EXCEPTION 'Only administrators can create puzzles.'; END IF;
  PERFORM public.escape_validate(p_definition);
  IF p_id IS NULL THEN
    INSERT INTO public.escape_blueprints(owner_id, definition) VALUES (uid, p_definition) RETURNING * INTO b;
  ELSE
    UPDATE public.escape_blueprints SET definition = p_definition, revision = revision + 1, updated_at = now()
      WHERE id = p_id AND owner_id = uid AND revision = p_revision RETURNING * INTO b;
    IF NOT FOUND THEN RAISE EXCEPTION 'Blueprint changed or access denied. Reload before saving.'; END IF;
  END IF;
  RETURN jsonb_build_object('id', b.id, 'revision', b.revision);
END; $$;

CREATE FUNCTION public.escape_start_session(p_blueprint_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := public.escape_require_user(); b public.escape_blueprints; sid uuid;
BEGIN
  IF NOT public.is_site_admin(uid::text) THEN RAISE EXCEPTION 'Only administrators can host puzzles.'; END IF;
  SELECT * INTO b FROM public.escape_blueprints WHERE id = p_blueprint_id AND owner_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blueprint not found.'; END IF;
  PERFORM public.escape_validate(b.definition);
  INSERT INTO public.escape_sessions(gm_id, blueprint_id, definition, states) VALUES (uid, b.id, b.definition, public.escape_reveal_ready(b.definition, '{}')) RETURNING id INTO sid;
  INSERT INTO public.escape_updates(session_id) VALUES (sid);
  RETURN public.escape_snapshot(sid);
END; $$;

CREATE FUNCTION public.escape_join_session(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := public.escape_require_user(); s public.escape_sessions;
BEGIN
  SELECT * INTO s FROM public.escape_sessions WHERE join_code = btrim(p_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation code not found.'; END IF;
  IF s.gm_id <> uid THEN INSERT INTO public.escape_members(session_id, user_id) VALUES (s.id, uid) ON CONFLICT DO NOTHING; END IF;
  UPDATE public.escape_updates SET revision = revision + 1 WHERE session_id = s.id;
  RETURN public.escape_snapshot(s.id);
END; $$;

CREATE FUNCTION public.escape_command(p_id uuid, p_revision integer, p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := public.escape_require_user(); s public.escape_sessions; n jsonb; action text := p_command->>'type'; gm boolean; key_id text; entry jsonb;
BEGIN
  IF NOT public.escape_can_read(p_id) THEN RAISE EXCEPTION 'Room not found or access denied.'; END IF;
  SELECT * INTO STRICT s FROM public.escape_sessions WHERE id = p_id FOR UPDATE;
  IF s.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'The party made progress. Refresh and try again.'; END IF;
  gm := s.gm_id = uid AND public.is_site_admin(uid::text);
  IF action IS NULL OR action NOT IN ('reveal','mark_used','unlock','pause','resume') THEN RAISE EXCEPTION 'Unknown command.'; END IF;
  IF action <> 'unlock' AND NOT gm THEN RAISE EXCEPTION 'Only the puzzle master can do that.'; END IF;
  IF s.status = 'completed' THEN RAISE EXCEPTION 'This room is complete. Start a fresh session to replay.'; END IF;
  IF action IN ('pause','resume') THEN
    s.status := CASE action WHEN 'pause' THEN 'paused' ELSE 'active' END;
  ELSE
    IF s.status <> 'active' THEN RAISE EXCEPTION 'The puzzle master has paused this room.'; END IF;
    SELECT value INTO n FROM jsonb_array_elements(s.definition->'nodes') WHERE value->>'id' = p_command->>'nodeId';
    IF n IS NULL THEN RAISE EXCEPTION 'Clue unavailable.'; END IF;
    IF action = 'reveal' THEN
      IF coalesce(s.states->>(n->>'id'), 'hidden') <> 'hidden' THEN RAISE EXCEPTION 'Already revealed.'; END IF;
      s.states := jsonb_set(s.states, ARRAY[n->>'id'], '"known"');
    ELSE
      IF coalesce(s.states->>(n->>'id'), 'hidden') <> 'known' THEN RAISE EXCEPTION 'Clue unavailable or already used.'; END IF;
      IF action = 'unlock' THEN
        IF n->>'kind' NOT IN ('container','room','puzzle','treasure') OR NOT public.escape_ready(n, s.states) THEN RAISE EXCEPTION 'This cannot be opened yet.'; END IF;
        IF jsonb_typeof(p_command->'code') IS DISTINCT FROM 'string' OR length(p_command->>'code') > 120
          OR jsonb_typeof(p_command->'itemIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid attempt.'; END IF;
        IF jsonb_array_length(p_command->'itemIds') > 100 THEN RAISE EXCEPTION 'Invalid attempt.'; END IF;
        IF n->>'code' <> '' AND lower(btrim(n->>'code')) <> lower(btrim(p_command->>'code')) THEN RAISE EXCEPTION 'The lock does not open. Check your code and items.'; END IF;
        FOR key_id IN SELECT jsonb_array_elements_text(n->'keyIds') LOOP
          IF coalesce(s.states->>key_id, 'hidden') NOT IN ('known','used') OR NOT ((p_command->'itemIds') ? key_id) THEN RAISE EXCEPTION 'The lock does not open. Check your code and items.'; END IF;
        END LOOP;
        FOR key_id IN SELECT jsonb_array_elements_text(n->'keyIds') LOOP
          s.states := jsonb_set(s.states, ARRAY[key_id], '"used"');
        END LOOP;
      END IF;
      s.states := jsonb_set(s.states, ARRAY[n->>'id'], '"used"');
    END IF;
    s.states := public.escape_reveal_ready(s.definition, s.states);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.definition->'nodes') v WHERE v->>'kind' = 'treasure' AND coalesce(s.states->>(v->>'id'),'hidden') <> 'used') THEN s.status := 'completed'; END IF;
  END IF;
  -- No answers, hidden node data, or submitted codes in shared history.
  entry := jsonb_build_object('action', action, 'title', coalesce(n->>'title', 'Session'), 'at', now());
  s.history := s.history || jsonb_build_array(entry);
  SELECT coalesce(jsonb_agg(value ORDER BY ordinal), '[]') INTO s.history FROM jsonb_array_elements(s.history) WITH ORDINALITY e(value, ordinal) WHERE ordinal > jsonb_array_length(s.history) - 60;
  UPDATE public.escape_sessions SET states = s.states, status = s.status, history = s.history, revision = revision + 1 WHERE id = s.id;
  UPDATE public.escape_updates SET revision = revision + 1 WHERE session_id = s.id;
  RETURN public.escape_snapshot(s.id);
END; $$;

REVOKE ALL ON FUNCTION public.escape_require_user(), public.escape_can_read(uuid), public.escape_validate(jsonb), public.escape_ready(jsonb,jsonb), public.escape_reveal_ready(jsonb,jsonb), public.escape_snapshot(uuid), public.escape_library(), public.escape_save_blueprint(uuid,jsonb,integer), public.escape_start_session(uuid), public.escape_join_session(text), public.escape_command(uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escape_can_read(uuid), public.escape_snapshot(uuid), public.escape_library(), public.escape_save_blueprint(uuid,jsonb,integer), public.escape_start_session(uuid), public.escape_join_session(text), public.escape_command(uuid,integer,jsonb) TO authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.escape_updates;
  END IF;
END; $$;
