/*
  # Arcane lock multiplayer puzzle sessions

  Adds standalone Supabase-owned session, lock, access, action-history, and
  future Foundry integration tables. The web game remains authoritative for UI
  only; Postgres stores canonical lock state and permission state.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS arcane_puzzle_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gm_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  access_provider_type text NOT NULL DEFAULT 'manual' CHECK (access_provider_type IN ('manual', 'foundry')),
  foundry_connection_status text,
  foundry_last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS arcane_puzzle_session_members (
  session_id uuid NOT NULL REFERENCES arcane_puzzle_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('gm', 'player', 'spectator')),
  invitation_status text NOT NULL DEFAULT 'invited' CHECK (invitation_status IN ('invited', 'accepted', 'declined', 'removed')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  removed_at timestamptz,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS arcane_lock_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  difficulty integer NOT NULL,
  public_definition jsonb NOT NULL,
  protected_definition jsonb NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arcane_lock_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES arcane_puzzle_sessions(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES arcane_lock_templates(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  tab_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'solved')),
  initial_state jsonb NOT NULL,
  current_state jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  generation bigint NOT NULL DEFAULT 1,
  solved_at timestamptz,
  solved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arcane_lock_player_access (
  lock_id uuid NOT NULL REFERENCES arcane_lock_instances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_type text NOT NULL DEFAULT 'manual' CHECK (provider_type IN ('manual', 'foundry')),
  provider_can_interact boolean NOT NULL DEFAULT false,
  provider_can_read boolean NOT NULL DEFAULT false,
  interact_override text NOT NULL DEFAULT 'automatic' CHECK (interact_override IN ('automatic', 'allow', 'deny')),
  read_override text NOT NULL DEFAULT 'automatic' CHECK (read_override IN ('automatic', 'allow', 'deny')),
  provider_updated_at timestamptz,
  provider_metadata jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lock_id, user_id)
);

CREATE TABLE IF NOT EXISTS arcane_lock_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL UNIQUE,
  lock_id uuid NOT NULL REFERENCES arcane_lock_instances(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('player', 'gm', 'system', 'foundry')),
  generation bigint NOT NULL,
  version_before bigint NOT NULL,
  version_after bigint NOT NULL,
  action_type text NOT NULL,
  action_payload jsonb NOT NULL,
  result_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS foundry_world_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_external_id text NOT NULL,
  world_name text,
  installation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  hashed_installation_secret text NOT NULL,
  linked_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS foundry_user_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_link_id uuid NOT NULL REFERENCES foundry_world_links(id) ON DELETE CASCADE,
  foundry_user_external_id text NOT NULL,
  supabase_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  foundry_user_name text,
  foundry_actor_external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_link_id, foundry_user_external_id)
);

CREATE TABLE IF NOT EXISTS foundry_lock_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_link_id uuid NOT NULL REFERENCES foundry_world_links(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES arcane_puzzle_sessions(id) ON DELETE CASCADE,
  lock_instance_id uuid NOT NULL REFERENCES arcane_lock_instances(id) ON DELETE CASCADE,
  scene_external_id text NOT NULL,
  lock_external_id text NOT NULL,
  interaction_region_external_id text,
  reading_region_external_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS foundry_access_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_link_id uuid NOT NULL REFERENCES foundry_world_links(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_link_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_arcane_sessions_gm ON arcane_puzzle_sessions(gm_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arcane_members_user ON arcane_puzzle_session_members(user_id, invitation_status);
CREATE INDEX IF NOT EXISTS idx_arcane_instances_session ON arcane_lock_instances(session_id, tab_order);
CREATE INDEX IF NOT EXISTS idx_arcane_access_user ON arcane_lock_player_access(user_id);
CREATE INDEX IF NOT EXISTS idx_arcane_actions_lock ON arcane_lock_actions(lock_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.arcane_is_session_member(target_session_id uuid, target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM arcane_puzzle_session_members member
    WHERE member.session_id = target_session_id
      AND member.user_id = target_user_id
      AND member.invitation_status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.arcane_is_session_gm(target_session_id uuid, target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM arcane_puzzle_sessions session
    WHERE session.id = target_session_id
      AND session.gm_user_id = target_user_id
  );
$$;

CREATE OR REPLACE VIEW public.arcane_effective_lock_access AS
SELECT
  access.lock_id,
  access.user_id,
  access.provider_type,
  access.provider_can_interact,
  access.provider_can_read,
  access.interact_override,
  access.read_override,
  CASE
    WHEN access.interact_override = 'allow' THEN true
    WHEN access.interact_override = 'deny' THEN false
    ELSE access.provider_can_interact
  END AS effective_can_interact,
  CASE
    WHEN access.read_override = 'allow' THEN true
    WHEN access.read_override = 'deny' THEN false
    ELSE access.provider_can_read
  END AS effective_can_read,
  access.provider_updated_at,
  access.updated_by,
  access.updated_at
FROM arcane_lock_player_access access;

CREATE OR REPLACE FUNCTION public.arcane_normalize_rotation(rotation_value integer, slot_count integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN slot_count <= 0 THEN 0
    ELSE ((rotation_value % slot_count) + slot_count) % slot_count
  END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_glyph_slot(ring_definition jsonb, glyph_id text, rotation_value integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (
      SELECT public.arcane_normalize_rotation((glyph.ordinality - 1)::integer + rotation_value, jsonb_array_length(ring_definition->'glyphIds'))
      FROM jsonb_array_elements_text(ring_definition->'glyphIds') WITH ORDINALITY AS glyph(value, ordinality)
      WHERE glyph.value = glyph_id
      LIMIT 1
    ),
    -1
  );
$$;

CREATE OR REPLACE FUNCTION public.arcane_glyph_at_slot(ring_definition jsonb, target_slot integer, rotation_value integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ring_definition->'glyphIds'->>public.arcane_normalize_rotation(target_slot - rotation_value, jsonb_array_length(ring_definition->'glyphIds'));
$$;

CREATE OR REPLACE FUNCTION public.arcane_decoy_destination_offset(ring_definition jsonb, glyph_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    (
      (COALESCE((
        SELECT glyph.ordinality - 1
        FROM jsonb_array_elements_text(ring_definition->'glyphIds') WITH ORDINALITY AS glyph(value, ordinality)
        WHERE glyph.value = glyph_id
        LIMIT 1
      ), 0) * 2 + length(ring_definition->>'id'))
      % GREATEST(1, jsonb_array_length(ring_definition->'glyphIds'))
    ) - floor(jsonb_array_length(ring_definition->'glyphIds') / 2.0)::integer
  );
$$;

CREATE OR REPLACE FUNCTION public.arcane_trace_energy(definition jsonb, state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  ring_record record;
  ring_definition jsonb;
  powered_glyph_id text;
  conduit jsonb;
  destination_ring jsonb;
  destination_ring_id text;
  source_slot integer;
  destination_slot integer;
  destination_glyph_id text;
  expected_next_glyph_id text;
  destination_offset integer;
  blocked boolean;
  valid boolean;
BEGIN
  FOR ring_record IN
    SELECT ring.value AS ring_value, ring.ordinality AS ring_position
    FROM jsonb_array_elements(definition->'rings') WITH ORDINALITY AS ring(value, ordinality)
  LOOP
    ring_definition := ring_record.ring_value;
    powered_glyph_id := state#>>ARRAY['poweredGlyphByRing', ring_definition->>'id'];
    IF powered_glyph_id IS NULL OR powered_glyph_id = '' THEN
      CONTINUE;
    END IF;

    SELECT conduit_value
    INTO conduit
    FROM jsonb_array_elements(COALESCE(ring_definition->'conduits', '[]'::jsonb)) AS conduit_items(conduit_value)
    WHERE conduit_value->>'sourceGlyphId' = powered_glyph_id
    LIMIT 1;

    IF conduit IS NULL THEN
      destination_offset := public.arcane_decoy_destination_offset(ring_definition, powered_glyph_id);
      destination_ring_id := NULL;
    ELSE
      destination_offset := COALESCE((conduit->>'destinationOffset')::integer, 0);
      destination_ring_id := conduit->>'destinationRingId';
    END IF;

    source_slot := public.arcane_glyph_slot(ring_definition, powered_glyph_id, COALESCE((state#>>ARRAY['ringRotations', ring_definition->>'id'])::integer, 0));

    IF destination_ring_id IS NOT NULL THEN
      SELECT ring.value
      INTO destination_ring
      FROM jsonb_array_elements(definition->'rings') AS ring(value)
      WHERE ring.value->>'id' = destination_ring_id
      LIMIT 1;
    ELSE
      SELECT ring.value
      INTO destination_ring
      FROM jsonb_array_elements(definition->'rings') WITH ORDINALITY AS ring(value, ordinality)
      WHERE ring.ordinality = ring_record.ring_position + 1
      LIMIT 1;
    END IF;

    IF destination_ring IS NULL THEN
      expected_next_glyph_id := definition->'solutionRules'->0->'chain'->>(jsonb_array_length(definition->'solutionRules'->0->'chain') - 1);
      valid := expected_next_glyph_id = powered_glyph_id;
      result := result || jsonb_build_array(jsonb_build_object(
        'fromRingId', ring_definition->>'id',
        'fromGlyphId', powered_glyph_id,
        'fromSlot', source_slot,
        'toRingId', 'core',
        'toSlot', NULL,
        'toGlyphId', NULL,
        'valid', valid,
        'blocked', false
      ));
    ELSE
      destination_slot := public.arcane_normalize_rotation(source_slot + destination_offset, jsonb_array_length(destination_ring->'glyphIds'));
      destination_glyph_id := public.arcane_glyph_at_slot(destination_ring, destination_slot, COALESCE((state#>>ARRAY['ringRotations', destination_ring->>'id'])::integer, 0));
      expected_next_glyph_id := definition->'solutionRules'->0->'chain'->>(ring_record.ring_position);
      blocked := EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(definition->'obstacles', '[]'::jsonb)) AS obstacle(value)
        JOIN LATERAL jsonb_array_elements(COALESCE(obstacle.value->'blocks', '[]'::jsonb)) AS block(value) ON true
        WHERE COALESCE((state#>>ARRAY['obstacleStates', obstacle.value->>'id', 'active'])::boolean, true) = true
          AND block.value->>'ringId' = destination_ring->>'id'
          AND (block.value->>'slot')::integer = destination_slot
      );
      valid := destination_glyph_id = expected_next_glyph_id AND NOT blocked;
      result := result || jsonb_build_array(jsonb_build_object(
        'fromRingId', ring_definition->>'id',
        'fromGlyphId', powered_glyph_id,
        'fromSlot', source_slot,
        'toRingId', destination_ring->>'id',
        'toSlot', destination_slot,
        'toGlyphId', destination_glyph_id,
        'valid', valid,
        'blocked', blocked
      ));
    END IF;

    conduit := NULL;
    destination_ring := NULL;
  END LOOP;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_validate_puzzle(definition jsonb, state jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  chain jsonb := definition->'solutionRules'->0->'chain';
  trace jsonb;
  ring_record record;
  powered_chain text[] := '{}';
  chain_item record;
BEGIN
  IF chain IS NULL OR jsonb_array_length(chain) = 0 THEN
    RETURN false;
  END IF;

  FOR ring_record IN
    SELECT ring.value AS ring_value
    FROM jsonb_array_elements(definition->'rings') AS ring(value)
  LOOP
    powered_chain := powered_chain || COALESCE(state#>>ARRAY['poweredGlyphByRing', ring_record.ring_value->>'id'], '');
  END LOOP;

  IF array_length(powered_chain, 1) <> jsonb_array_length(chain) THEN
    RETURN false;
  END IF;

  FOR chain_item IN
    SELECT value, ordinality
    FROM jsonb_array_elements_text(chain) WITH ORDINALITY
  LOOP
    IF powered_chain[chain_item.ordinality] <> chain_item.value THEN
      RETURN false;
    END IF;
  END LOOP;

  trace := public.arcane_trace_energy(definition, state);
  IF jsonb_array_length(trace) < GREATEST(0, jsonb_array_length(definition->'rings') - 1) THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(trace) AS segment(value)
    WHERE COALESCE((segment.value->>'valid')::boolean, false) = false
       OR COALESCE((segment.value->>'blocked')::boolean, false) = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_ring_sockets(ring_definition jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(ring_definition->'glyphSockets') = 'array' AND jsonb_array_length(ring_definition->'glyphSockets') > 0 THEN ring_definition->'glyphSockets'
    ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', (ring_definition->>'id') || ':' || (glyph.ordinality - 1)::text || ':' || glyph.value, 'glyphId', glyph.value) ORDER BY glyph.ordinality)
      FROM jsonb_array_elements_text(COALESCE(ring_definition->'glyphIds', '[]'::jsonb)) WITH ORDINALITY AS glyph(value, ordinality)
    ), '[]'::jsonb)
  END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_socket_count(ring_definition jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_array_length(public.arcane_ring_sockets(ring_definition));
$$;

CREATE OR REPLACE FUNCTION public.arcane_is_empty_glyph(glyph_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT glyph_id IS NULL OR glyph_id = '' OR glyph_id = 'empty-slot';
$$;

CREATE OR REPLACE FUNCTION public.arcane_socket_slot(ring_definition jsonb, socket_id text, rotation_value integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT public.arcane_normalize_rotation((socket.ordinality - 1)::integer + rotation_value, public.arcane_socket_count(ring_definition))
    FROM jsonb_array_elements(public.arcane_ring_sockets(ring_definition)) WITH ORDINALITY AS socket(value, ordinality)
    WHERE socket.value->>'id' = socket_id
    LIMIT 1
  ), -1);
$$;

CREATE OR REPLACE FUNCTION public.arcane_glyph_slot(ring_definition jsonb, glyph_id text, rotation_value integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.arcane_is_empty_glyph(glyph_id) THEN -1
    ELSE COALESCE((
      SELECT public.arcane_socket_slot(ring_definition, socket.value->>'id', rotation_value)
      FROM jsonb_array_elements(public.arcane_ring_sockets(ring_definition)) AS socket(value)
      WHERE socket.value->>'glyphId' = glyph_id
      LIMIT 1
    ), -1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_socket_at_slot(ring_definition jsonb, target_slot integer, rotation_value integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.arcane_ring_sockets(ring_definition)->public.arcane_normalize_rotation(target_slot - rotation_value, public.arcane_socket_count(ring_definition));
$$;

CREATE OR REPLACE FUNCTION public.arcane_glyph_at_slot(ring_definition jsonb, target_slot integer, rotation_value integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.arcane_socket_at_slot(ring_definition, target_slot, rotation_value)->>'glyphId';
$$;

CREATE OR REPLACE FUNCTION public.arcane_first_socket_id_for_glyph(ring_definition jsonb, glyph_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.arcane_is_empty_glyph(glyph_id) THEN NULL
    ELSE (
      SELECT socket.value->>'id'
      FROM jsonb_array_elements(public.arcane_ring_sockets(ring_definition)) AS socket(value)
      WHERE socket.value->>'glyphId' = glyph_id
      LIMIT 1
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_signed_rotation(rotation_value integer, slot_count integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.arcane_normalize_rotation(rotation_value, slot_count) > slot_count / 2.0
      THEN public.arcane_normalize_rotation(rotation_value, slot_count) - slot_count
    ELSE public.arcane_normalize_rotation(rotation_value, slot_count)
  END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_source_base_slot(ring_definition jsonb, glyph_id text, socket_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, COALESCE((
    SELECT socket.ordinality - 1
    FROM jsonb_array_elements(public.arcane_ring_sockets(ring_definition)) WITH ORDINALITY AS socket(value, ordinality)
    WHERE CASE WHEN socket_id IS NOT NULL THEN socket.value->>'id' = socket_id ELSE socket.value->>'glyphId' = glyph_id END
    LIMIT 1
  ), 0));
$$;

CREATE OR REPLACE FUNCTION public.arcane_destination_slot_for_conduit(source_ring jsonb, destination_ring jsonb, glyph_id text, socket_id text, source_rotation integer, destination_offset integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.arcane_normalize_rotation(
    public.arcane_source_base_slot(source_ring, glyph_id, socket_id)
      + public.arcane_signed_rotation(source_rotation, public.arcane_socket_count(source_ring))
      + destination_offset,
    public.arcane_socket_count(destination_ring)
  );
$$;

CREATE OR REPLACE FUNCTION public.arcane_decoy_destination_offset(ring_definition jsonb, glyph_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    (
      (COALESCE((
        SELECT socket.ordinality - 1
        FROM jsonb_array_elements(public.arcane_ring_sockets(ring_definition)) WITH ORDINALITY AS socket(value, ordinality)
        WHERE socket.value->>'glyphId' = glyph_id
        LIMIT 1
      ), 0) * 2 + length(ring_definition->>'id'))
      % GREATEST(1, public.arcane_socket_count(ring_definition))
    ) - floor(public.arcane_socket_count(ring_definition) / 2.0)::integer
  );
$$;

CREATE OR REPLACE FUNCTION public.arcane_decoy_destination_offset(ring_definition jsonb, glyph_id text, socket_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    (
      (COALESCE((
        SELECT socket.ordinality - 1
        FROM jsonb_array_elements(public.arcane_ring_sockets(ring_definition)) WITH ORDINALITY AS socket(value, ordinality)
        WHERE CASE WHEN socket_id IS NOT NULL THEN socket.value->>'id' = socket_id ELSE socket.value->>'glyphId' = glyph_id END
        LIMIT 1
      ), 0) * 2 + length(ring_definition->>'id'))
      % GREATEST(1, public.arcane_socket_count(ring_definition))
    ) - floor(public.arcane_socket_count(ring_definition) / 2.0)::integer
  );
$$;

CREATE OR REPLACE FUNCTION public.arcane_is_blocked(definition jsonb, ring_id text, target_slot integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(definition->'obstacles', '[]'::jsonb)) AS obstacle(value)
    JOIN LATERAL jsonb_array_elements(COALESCE(obstacle.value->'blocks', '[]'::jsonb)) AS block(value) ON true
    WHERE block.value->>'ringId' = ring_id
      AND (block.value->>'slot')::integer = target_slot
  );
$$;

CREATE OR REPLACE FUNCTION public.arcane_node_matches(glyph_id text, socket_id text, node_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT glyph_id = node_id OR socket_id = node_id;
$$;

CREATE OR REPLACE FUNCTION public.arcane_connection_expected(definition jsonb, from_glyph_id text, from_socket_id text, to_glyph_id text, to_socket_id text, to_ring_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN to_ring_id = 'core' THEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(definition->'solutionRules', '[]'::jsonb)) AS rule(value)
      WHERE COALESCE((rule.value->>'required')::boolean, true) = true
        AND public.arcane_node_matches(from_glyph_id, from_socket_id, rule.value->'chain'->>(jsonb_array_length(rule.value->'chain') - 1))
    )
    ELSE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(definition->'solutionRules', '[]'::jsonb)) AS rule(value)
      JOIN LATERAL jsonb_array_elements_text(rule.value->'chain') WITH ORDINALITY AS chain_node(value, ordinality) ON true
      WHERE COALESCE((rule.value->>'required')::boolean, true) = true
        AND chain_node.ordinality < jsonb_array_length(rule.value->'chain')
        AND public.arcane_node_matches(from_glyph_id, from_socket_id, chain_node.value)
        AND (rule.value->'chain'->>(chain_node.ordinality::integer) = to_glyph_id OR rule.value->'chain'->>(chain_node.ordinality::integer) = to_socket_id)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_trace_energy(definition jsonb, state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  ring_record record;
  ring_definition jsonb;
  powered_glyph_id text;
  powered_socket_id text;
  source_slot integer;
  source_conduits jsonb;
  conduit_record record;
  conduit jsonb;
  destination_ring jsonb;
  destination_ring_id text;
  destination_slot integer;
  destination_socket jsonb;
  destination_glyph_id text;
  destination_socket_id text;
  blocked boolean;
  valid boolean;
  decoy boolean;
BEGIN
  FOR ring_record IN
    SELECT ring.value AS ring_value, ring.ordinality AS ring_position
    FROM jsonb_array_elements(definition->'rings') WITH ORDINALITY AS ring(value, ordinality)
  LOOP
    ring_definition := ring_record.ring_value;
    powered_glyph_id := state#>>ARRAY['poweredGlyphByRing', ring_definition->>'id'];
    IF public.arcane_is_empty_glyph(powered_glyph_id) THEN CONTINUE; END IF;

    powered_socket_id := COALESCE(state#>>ARRAY['poweredSocketByRing', ring_definition->>'id'], public.arcane_first_socket_id_for_glyph(ring_definition, powered_glyph_id));
    source_slot := CASE
      WHEN powered_socket_id IS NOT NULL THEN public.arcane_socket_slot(ring_definition, powered_socket_id, COALESCE((state#>>ARRAY['ringRotations', ring_definition->>'id'])::integer, 0))
      ELSE public.arcane_glyph_slot(ring_definition, powered_glyph_id, COALESCE((state#>>ARRAY['ringRotations', ring_definition->>'id'])::integer, 0))
    END;
    IF public.arcane_is_blocked(definition, ring_definition->>'id', source_slot) THEN CONTINUE; END IF;

    SELECT COALESCE(jsonb_agg(conduit_items.conduit_value), '[]'::jsonb)
    INTO source_conduits
    FROM jsonb_array_elements(COALESCE(ring_definition->'conduits', '[]'::jsonb)) AS conduit_items(conduit_value)
    WHERE CASE
      WHEN powered_socket_id IS NOT NULL AND conduit_items.conduit_value ? 'sourceSocketId' THEN conduit_items.conduit_value->>'sourceSocketId' = powered_socket_id
      WHEN conduit_items.conduit_value ? 'sourceSocketId' THEN false
      ELSE conduit_items.conduit_value->>'sourceGlyphId' = powered_glyph_id
    END;

    IF jsonb_array_length(source_conduits) = 0 THEN
      source_conduits := jsonb_build_array(jsonb_build_object(
        'sourceGlyphId', powered_glyph_id,
        'sourceSocketId', powered_socket_id,
        'destinationOffset', public.arcane_decoy_destination_offset(ring_definition, powered_glyph_id, powered_socket_id),
        'decoy', true
      ));
    END IF;

    FOR conduit_record IN SELECT conduit_value FROM jsonb_array_elements(source_conduits) AS conduit_items(conduit_value) LOOP
      conduit := conduit_record.conduit_value;
      destination_ring_id := conduit->>'destinationRingId';
      decoy := COALESCE((conduit->>'decoy')::boolean, false);

      IF destination_ring_id IS NOT NULL THEN
        SELECT ring.value INTO destination_ring FROM jsonb_array_elements(definition->'rings') AS ring(value) WHERE ring.value->>'id' = destination_ring_id LIMIT 1;
      ELSE
        SELECT ring.value INTO destination_ring FROM jsonb_array_elements(definition->'rings') WITH ORDINALITY AS ring(value, ordinality) WHERE ring.ordinality = ring_record.ring_position + 1 LIMIT 1;
      END IF;

      IF destination_ring IS NULL THEN
        valid := public.arcane_connection_expected(definition, powered_glyph_id, powered_socket_id, NULL, NULL, 'core');
        result := result || jsonb_build_array(jsonb_build_object(
          'fromRingId', ring_definition->>'id',
          'fromGlyphId', powered_glyph_id,
          'fromSocketId', COALESCE(powered_socket_id, (ring_definition->>'id') || ':' || powered_glyph_id),
          'fromSlot', source_slot,
          'toRingId', 'core',
          'toSlot', NULL,
          'toGlyphId', NULL,
          'toSocketId', NULL,
          'valid', valid,
          'blocked', false,
          'decoy', decoy
        ));
      ELSE
        destination_slot := CASE
          WHEN conduit ? 'destinationSlot' THEN (conduit->>'destinationSlot')::integer
          ELSE public.arcane_destination_slot_for_conduit(
            ring_definition,
            destination_ring,
            powered_glyph_id,
            powered_socket_id,
            COALESCE((state#>>ARRAY['ringRotations', ring_definition->>'id'])::integer, 0),
            COALESCE((conduit->>'destinationOffset')::integer, 0)
          )
        END;
        destination_socket := public.arcane_socket_at_slot(destination_ring, destination_slot, COALESCE((state#>>ARRAY['ringRotations', destination_ring->>'id'])::integer, 0));
        destination_glyph_id := destination_socket->>'glyphId';
        destination_socket_id := destination_socket->>'id';
        IF public.arcane_is_empty_glyph(destination_glyph_id) THEN
          destination_glyph_id := NULL;
          destination_socket_id := NULL;
        END IF;
        blocked := public.arcane_is_blocked(definition, destination_ring->>'id', destination_slot);
        valid := public.arcane_connection_expected(definition, powered_glyph_id, powered_socket_id, destination_glyph_id, destination_socket_id, destination_ring->>'id') AND NOT blocked;
        result := result || jsonb_build_array(jsonb_build_object(
          'fromRingId', ring_definition->>'id',
          'fromGlyphId', powered_glyph_id,
          'fromSocketId', COALESCE(powered_socket_id, (ring_definition->>'id') || ':' || powered_glyph_id),
          'fromSlot', source_slot,
          'toRingId', destination_ring->>'id',
          'toSlot', destination_slot,
          'toGlyphId', destination_glyph_id,
          'toSocketId', destination_socket_id,
          'valid', valid,
          'blocked', blocked,
          'decoy', decoy
        ));
      END IF;

      destination_ring := NULL;
      destination_socket := NULL;
    END LOOP;
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_node_powered(definition jsonb, state jsonb, node_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.arcane_is_empty_glyph(node_id) THEN false
    ELSE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(definition->'rings', '[]'::jsonb)) AS ring(value)
      WHERE state#>>ARRAY['poweredGlyphByRing', ring.value->>'id'] = node_id
         OR state#>>ARRAY['poweredSocketByRing', ring.value->>'id'] = node_id
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(public.arcane_ring_sockets(ring.value)) AS socket(value)
           WHERE socket.value->>'id' = state#>>ARRAY['poweredSocketByRing', ring.value->>'id']
             AND socket.value->>'glyphId' = node_id
         )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_chain_segments_satisfied(chain jsonb, trace jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  index_value integer;
  from_node text;
  to_node text;
BEGIN
  IF chain IS NULL OR jsonb_array_length(chain) <= 1 THEN RETURN true; END IF;
  FOR index_value IN 0..(jsonb_array_length(chain) - 2) LOOP
    from_node := chain->>index_value;
    to_node := chain->>(index_value + 1);
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(trace) AS segment(value)
      WHERE COALESCE((segment.value->>'valid')::boolean, false) = true
        AND COALESCE((segment.value->>'blocked')::boolean, false) = false
        AND public.arcane_node_matches(segment.value->>'fromGlyphId', segment.value->>'fromSocketId', from_node)
        AND public.arcane_node_matches(segment.value->>'toGlyphId', segment.value->>'toSocketId', to_node)
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcane_validate_puzzle(definition jsonb, state jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trace jsonb;
  rule_record record;
  node_record record;
BEGIN
  IF definition->'solutionRules' IS NULL OR jsonb_array_length(definition->'solutionRules') = 0 THEN RETURN false; END IF;
  trace := public.arcane_trace_energy(definition, state);

  FOR rule_record IN
    SELECT rule.value AS rule_value
    FROM jsonb_array_elements(definition->'solutionRules') AS rule(value)
    WHERE COALESCE((rule.value->>'required')::boolean, true) = true
  LOOP
    IF rule_record.rule_value->'chain' IS NULL OR jsonb_array_length(rule_record.rule_value->'chain') = 0 THEN RETURN false; END IF;
    FOR node_record IN SELECT value FROM jsonb_array_elements_text(rule_record.rule_value->'chain') AS node(value) LOOP
      IF NOT public.arcane_node_powered(definition, state, node_record.value) THEN RETURN false; END IF;
    END LOOP;
    IF NOT public.arcane_chain_segments_satisfied(rule_record.rule_value->'chain', trace) THEN RETURN false; END IF;
  END LOOP;

  RETURN NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(trace) AS segment(value)
    WHERE COALESCE((segment.value->>'valid')::boolean, false) = false
      AND COALESCE((segment.value->>'blocked')::boolean, false) = false
      AND COALESCE((segment.value->>'decoy')::boolean, false) = false
  );
END;
$$;

ALTER TABLE arcane_puzzle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcane_puzzle_session_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcane_lock_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcane_lock_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcane_lock_player_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcane_lock_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundry_world_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundry_user_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundry_lock_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundry_access_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read arcane sessions" ON arcane_puzzle_sessions
  FOR SELECT TO authenticated USING (public.arcane_is_session_member(id) OR gm_user_id = auth.uid());
CREATE POLICY "Authenticated users can create arcane sessions" ON arcane_puzzle_sessions
  FOR INSERT TO authenticated WITH CHECK (gm_user_id = auth.uid());
CREATE POLICY "GMs can update arcane sessions" ON arcane_puzzle_sessions
  FOR UPDATE TO authenticated USING (gm_user_id = auth.uid()) WITH CHECK (gm_user_id = auth.uid());

CREATE POLICY "Members can read arcane membership" ON arcane_puzzle_session_members
  FOR SELECT TO authenticated USING (public.arcane_is_session_member(session_id) OR user_id = auth.uid());
CREATE POLICY "GMs can manage arcane membership" ON arcane_puzzle_session_members
  FOR ALL TO authenticated USING (public.arcane_is_session_gm(session_id)) WITH CHECK (public.arcane_is_session_gm(session_id));
CREATE POLICY "Users can answer invitations" ON arcane_puzzle_session_members
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members can read public lock templates" ON arcane_lock_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members can read lock instances" ON arcane_lock_instances
  FOR SELECT TO authenticated USING (public.arcane_is_session_member(session_id) OR public.arcane_is_session_gm(session_id));
CREATE POLICY "GMs can manage lock instances" ON arcane_lock_instances
  FOR ALL TO authenticated USING (public.arcane_is_session_gm(session_id)) WITH CHECK (public.arcane_is_session_gm(session_id));

CREATE POLICY "Users can read their own access and GMs can read session access" ON arcane_lock_player_access
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM arcane_lock_instances lock
      WHERE lock.id = lock_id AND public.arcane_is_session_gm(lock.session_id)
    )
  );
CREATE POLICY "GMs can manage lock access" ON arcane_lock_player_access
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM arcane_lock_instances lock WHERE lock.id = lock_id AND public.arcane_is_session_gm(lock.session_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM arcane_lock_instances lock WHERE lock.id = lock_id AND public.arcane_is_session_gm(lock.session_id))
  );

CREATE POLICY "Members can read lock action history" ON arcane_lock_actions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM arcane_lock_instances lock
      WHERE lock.id = lock_id AND public.arcane_is_session_member(lock.session_id)
    )
  );

CREATE POLICY "Linked GMs can read foundry links" ON foundry_world_links
  FOR SELECT TO authenticated USING (linked_by_user_id = auth.uid());
CREATE POLICY "Linked GMs can manage foundry links" ON foundry_world_links
  FOR ALL TO authenticated USING (linked_by_user_id = auth.uid()) WITH CHECK (linked_by_user_id = auth.uid());
CREATE POLICY "Linked GMs can read foundry user links" ON foundry_user_links
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM foundry_world_links link WHERE link.id = world_link_id AND link.linked_by_user_id = auth.uid()));
CREATE POLICY "Linked GMs can manage foundry user links" ON foundry_user_links
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM foundry_world_links link WHERE link.id = world_link_id AND link.linked_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foundry_world_links link WHERE link.id = world_link_id AND link.linked_by_user_id = auth.uid()));
CREATE POLICY "Linked GMs can read foundry bindings" ON foundry_lock_bindings
  FOR SELECT TO authenticated USING (public.arcane_is_session_gm(session_id));
CREATE POLICY "Linked GMs can manage foundry bindings" ON foundry_lock_bindings
  FOR ALL TO authenticated USING (public.arcane_is_session_gm(session_id)) WITH CHECK (public.arcane_is_session_gm(session_id));

CREATE OR REPLACE FUNCTION public.get_arcane_lock_view_for_current_user(target_session_id uuid, target_lock_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_lock arcane_lock_instances%ROWTYPE;
  member_role text;
  can_read boolean := false;
  can_interact boolean := false;
  template arcane_lock_templates%ROWTYPE;
BEGIN
  IF NOT public.arcane_is_session_member(target_session_id) AND NOT public.arcane_is_session_gm(target_session_id) THEN
    RAISE EXCEPTION 'Not a member of this arcane puzzle session';
  END IF;

  SELECT COALESCE(member.role, 'gm')
  INTO member_role
  FROM arcane_puzzle_sessions session
  LEFT JOIN arcane_puzzle_session_members member
    ON member.session_id = session.id AND member.user_id = auth.uid()
  WHERE session.id = target_session_id;

  SELECT *
  INTO selected_lock
  FROM arcane_lock_instances lock
  WHERE lock.session_id = target_session_id
    AND (target_lock_id IS NULL OR lock.id = target_lock_id)
  ORDER BY lock.tab_order
  LIMIT 1;

  IF selected_lock.id IS NULL THEN
    RAISE EXCEPTION 'No lock found';
  END IF;

  SELECT * INTO template FROM arcane_lock_templates WHERE id = selected_lock.template_id;

  SELECT
    CASE WHEN member_role = 'gm' THEN true ELSE COALESCE(access.effective_can_read, false) END,
    CASE WHEN member_role = 'gm' THEN true ELSE COALESCE(access.effective_can_interact, false) END
  INTO can_read, can_interact
  FROM arcane_effective_lock_access access
  WHERE access.lock_id = selected_lock.id AND access.user_id = auth.uid();

  RETURN jsonb_build_object(
    'session', (
      SELECT jsonb_build_object(
        'id', session.id,
        'name', session.name,
        'status', session.status,
        'gmUserId', session.gm_user_id,
        'gmDisplayName', COALESCE(profile.username, 'GM'),
        'accessProviderType', session.access_provider_type,
        'lockCount', (SELECT count(*) FROM arcane_lock_instances WHERE session_id = session.id),
        'acceptedMemberCount', (SELECT count(*) FROM arcane_puzzle_session_members WHERE session_id = session.id AND invitation_status = 'accepted'),
        'currentUserRole', member_role
      )
      FROM arcane_puzzle_sessions session
      LEFT JOIN users profile ON profile.auth_user_id = session.gm_user_id::text
      WHERE session.id = target_session_id
    ),
    'locks', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', lock.id,
        'sessionId', lock.session_id,
        'templateId', template_row.template_key,
        'displayName', lock.display_name,
        'tabOrder', lock.tab_order,
        'status', lock.status,
        'version', lock.version,
        'generation', lock.generation,
        'solvedAt', lock.solved_at,
        'viewerCount', 0,
        'currentState', lock.current_state
      ) ORDER BY lock.tab_order)
      FROM arcane_lock_instances lock
      JOIN arcane_lock_templates template_row ON template_row.id = lock.template_id
      WHERE lock.session_id = target_session_id
    ),
    'participants', (
      SELECT jsonb_agg(jsonb_build_object(
        'userId', member.user_id,
        'displayName', COALESCE(profile.username, 'Player'),
        'role', member.role,
        'invitationStatus', member.invitation_status,
        'online', false,
        'activeLockId', NULL
      ))
      FROM arcane_puzzle_session_members member
      LEFT JOIN users profile ON profile.auth_user_id = member.user_id::text
      WHERE member.session_id = target_session_id
    ),
    'activeLock', jsonb_build_object(
      'id', selected_lock.id,
      'sessionId', selected_lock.session_id,
      'templateId', template.template_key,
      'displayName', selected_lock.display_name,
      'tabOrder', selected_lock.tab_order,
      'status', selected_lock.status,
      'version', selected_lock.version,
      'generation', selected_lock.generation,
      'solvedAt', selected_lock.solved_at,
      'viewerCount', 0,
      'currentState', selected_lock.current_state
    ),
    'publicDefinition', template.public_definition,
    'inscription', CASE WHEN can_read THEN template.protected_definition->>'inscription' ELSE COALESCE(template.public_definition->>'obscuredInscription', 'The inscription is too distant to decipher.') END,
    'translatedHint', CASE WHEN can_read THEN template.protected_definition->>'translatedHint' ELSE NULL END,
    'canReadInstructions', can_read,
    'canInteract', can_interact,
    'access', (
      SELECT COALESCE(jsonb_agg(to_jsonb(access)), '[]'::jsonb)
      FROM arcane_effective_lock_access access
      WHERE access.lock_id = selected_lock.id
    ),
    'actionHistory', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', action.id,
        'actorName', COALESCE(profile.username, action.actor_type),
        'actionType', action.action_type,
        'createdAt', action.created_at,
        'summary', COALESCE(action.result_summary->>'message', action.action_type)
      ) ORDER BY action.created_at DESC), '[]'::jsonb)
      FROM arcane_lock_actions action
      LEFT JOIN users profile ON profile.auth_user_id = action.actor_user_id::text
      WHERE action.lock_id = selected_lock.id
      LIMIT 20
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.perform_lock_action(
  lock_instance_id uuid,
  expected_version bigint,
  expected_generation bigint,
  action_id uuid,
  action_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_lock arcane_lock_instances%ROWTYPE;
  target_session arcane_puzzle_sessions%ROWTYPE;
  template_row arcane_lock_templates%ROWTYPE;
  member_role text;
  access_row arcane_effective_lock_access%ROWTYPE;
  definition jsonb;
  next_state jsonb;
  next_version bigint;
  target_ring jsonb;
  linked_ring jsonb;
  ring_slot_count integer;
  next_rotation integer;
  previous_rotation integer;
  rotation_delta integer;
  selected_socket_id text;
  solved_result boolean := false;
  result_message text := 'Action accepted';
BEGIN
  SELECT * INTO target_lock FROM arcane_lock_instances WHERE id = lock_instance_id FOR UPDATE;
  IF target_lock.id IS NULL THEN RAISE EXCEPTION 'Unknown lock'; END IF;
  SELECT * INTO target_session FROM arcane_puzzle_sessions WHERE id = target_lock.session_id;
  SELECT * INTO template_row FROM arcane_lock_templates WHERE id = target_lock.template_id;
  definition := template_row.public_definition || template_row.protected_definition;

  IF target_session.status <> 'active' THEN RAISE EXCEPTION 'session_not_active'; END IF;
  IF target_lock.status <> 'active' THEN RAISE EXCEPTION 'lock_not_active'; END IF;
  IF target_lock.generation <> expected_generation THEN RAISE EXCEPTION 'old_generation'; END IF;
  IF target_lock.version <> expected_version THEN RAISE EXCEPTION 'stale_version'; END IF;
  IF EXISTS (SELECT 1 FROM arcane_lock_actions WHERE arcane_lock_actions.action_id = perform_lock_action.action_id) THEN
    RAISE EXCEPTION 'duplicate_action';
  END IF;

  SELECT member.role INTO member_role
  FROM arcane_puzzle_session_members member
  WHERE member.session_id = target_lock.session_id
    AND member.user_id = auth.uid()
    AND member.invitation_status = 'accepted';

  IF public.arcane_is_session_gm(target_lock.session_id) THEN
    member_role := 'gm';
  END IF;
  IF member_role IS NULL THEN RAISE EXCEPTION 'not_a_member'; END IF;
  IF member_role = 'spectator' THEN RAISE EXCEPTION 'spectator_denied'; END IF;

  SELECT * INTO access_row
  FROM arcane_effective_lock_access
  WHERE lock_id = target_lock.id AND user_id = auth.uid();
  IF member_role <> 'gm' AND COALESCE(access_row.effective_can_interact, false) = false THEN
    RAISE EXCEPTION 'movement_denied';
  END IF;

  next_state := target_lock.current_state;
  next_state := jsonb_set(next_state, '{energyTrace}', '[]'::jsonb, true);
  next_state := jsonb_set(next_state, '{lastInvokeFailed}', 'false'::jsonb, true);
  IF action_payload->>'type' = 'set_ring_rotation' THEN
    SELECT ring.value INTO target_ring
    FROM jsonb_array_elements(definition->'rings') AS ring(value)
    WHERE ring.value->>'id' = action_payload->>'ringId'
    LIMIT 1;
    IF target_ring IS NULL THEN RAISE EXCEPTION 'illegal_action'; END IF;
    ring_slot_count := public.arcane_socket_count(target_ring);
    previous_rotation := COALESCE((next_state#>>ARRAY['ringRotations', target_ring->>'id'])::integer, 0);
    next_rotation := public.arcane_normalize_rotation((action_payload->>'rotation')::integer, ring_slot_count);
    rotation_delta := next_rotation - previous_rotation;
    next_state := jsonb_set(
      next_state,
      ARRAY['ringRotations', action_payload->>'ringId'],
      to_jsonb(next_rotation),
      true
    );
    IF target_ring ? 'linkedRing' THEN
      SELECT ring.value INTO linked_ring
      FROM jsonb_array_elements(definition->'rings') AS ring(value)
      WHERE ring.value->>'id' = target_ring->'linkedRing'->>'ringId'
      LIMIT 1;
      IF linked_ring IS NOT NULL THEN
        next_state := jsonb_set(
          next_state,
          ARRAY['ringRotations', linked_ring->>'id'],
          to_jsonb(public.arcane_normalize_rotation(
            COALESCE((next_state#>>ARRAY['ringRotations', linked_ring->>'id'])::integer, 0)
            + round(rotation_delta * COALESCE((target_ring->'linkedRing'->>'ratio')::numeric, 1))::integer * COALESCE((target_ring->'linkedRing'->>'direction')::integer, 1),
            public.arcane_socket_count(linked_ring)
          )),
          true
        );
      END IF;
    END IF;
  ELSIF action_payload->>'type' = 'rotate_ring' THEN
    SELECT ring.value INTO target_ring
    FROM jsonb_array_elements(definition->'rings') AS ring(value)
    WHERE ring.value->>'id' = action_payload->>'ringId'
    LIMIT 1;
    IF target_ring IS NULL THEN RAISE EXCEPTION 'illegal_action'; END IF;
    ring_slot_count := public.arcane_socket_count(target_ring);
    rotation_delta := ((action_payload->>'direction')::integer * (action_payload->>'steps')::integer);
    next_rotation := public.arcane_normalize_rotation(COALESCE((target_lock.current_state#>>ARRAY['ringRotations', action_payload->>'ringId'])::integer, 0) + rotation_delta, ring_slot_count);
    next_state := jsonb_set(
      next_state,
      ARRAY['ringRotations', action_payload->>'ringId'],
      to_jsonb(next_rotation),
      true
    );
    IF target_ring ? 'linkedRing' THEN
      SELECT ring.value INTO linked_ring
      FROM jsonb_array_elements(definition->'rings') AS ring(value)
      WHERE ring.value->>'id' = target_ring->'linkedRing'->>'ringId'
      LIMIT 1;
      IF linked_ring IS NOT NULL THEN
        next_state := jsonb_set(
          next_state,
          ARRAY['ringRotations', linked_ring->>'id'],
          to_jsonb(public.arcane_normalize_rotation(
            COALESCE((next_state#>>ARRAY['ringRotations', linked_ring->>'id'])::integer, 0)
            + round(rotation_delta * COALESCE((target_ring->'linkedRing'->>'ratio')::numeric, 1))::integer * COALESCE((target_ring->'linkedRing'->>'direction')::integer, 1),
            public.arcane_socket_count(linked_ring)
          )),
          true
        );
      END IF;
    END IF;
  ELSIF action_payload->>'type' = 'power_glyph' THEN
    SELECT ring.value INTO target_ring
    FROM jsonb_array_elements(definition->'rings') AS ring(value)
    WHERE ring.value->>'id' = action_payload->>'ringId'
    LIMIT 1;
    IF public.arcane_is_empty_glyph(action_payload->>'glyphId') THEN
      RAISE EXCEPTION 'illegal_action';
    END IF;
    selected_socket_id := COALESCE(action_payload->>'socketId', public.arcane_first_socket_id_for_glyph(target_ring, action_payload->>'glyphId'));
    IF target_ring IS NULL OR selected_socket_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(public.arcane_ring_sockets(target_ring)) AS socket(value)
      WHERE socket.value->>'id' = selected_socket_id
        AND socket.value->>'glyphId' = action_payload->>'glyphId'
    ) THEN
      RAISE EXCEPTION 'illegal_action';
    END IF;
    next_state := jsonb_set(next_state, ARRAY['poweredGlyphByRing', action_payload->>'ringId'], to_jsonb(action_payload->>'glyphId'), true);
    IF action_payload ? 'socketId' OR next_state ? 'poweredSocketByRing' THEN
      IF NOT next_state ? 'poweredSocketByRing' THEN
        next_state := jsonb_set(next_state, '{poweredSocketByRing}', '{}'::jsonb, true);
      END IF;
      next_state := jsonb_set(next_state, ARRAY['poweredSocketByRing', action_payload->>'ringId'], to_jsonb(selected_socket_id), true);
    END IF;
  ELSIF action_payload->>'type' = 'move_obstacle' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(definition->'obstacles', '[]'::jsonb)) AS obstacle(value)
      WHERE obstacle.value->>'id' = action_payload->>'obstacleId'
    ) THEN
      RAISE EXCEPTION 'illegal_action';
    END IF;
    next_state := jsonb_set(
      next_state,
      ARRAY['obstacleStates', action_payload->>'obstacleId', 'position'],
      to_jsonb((action_payload->>'targetPosition')::integer),
      true
    );
  ELSIF action_payload->>'type' = 'invoke' THEN
    solved_result := public.arcane_validate_puzzle(definition, next_state);
    next_state := jsonb_set(next_state, '{solved}', to_jsonb(solved_result), true);
    next_state := jsonb_set(next_state, '{lastInvokeFailed}', to_jsonb(NOT solved_result), true);
    result_message := CASE WHEN solved_result THEN 'The lock core opens' ELSE 'The lock flares red; the path is incorrect' END;
  ELSE
    RAISE EXCEPTION 'illegal_action';
  END IF;

  next_state := jsonb_set(next_state, '{energyTrace}', public.arcane_trace_energy(definition, next_state), true);

  next_version := target_lock.version + 1;
  UPDATE arcane_lock_instances
  SET current_state = next_state,
      version = next_version,
      status = CASE WHEN action_payload->>'type' = 'invoke' AND solved_result THEN 'solved' ELSE status END,
      solved_at = CASE WHEN action_payload->>'type' = 'invoke' AND solved_result THEN now() ELSE solved_at END,
      solved_by = CASE WHEN action_payload->>'type' = 'invoke' AND solved_result THEN auth.uid() ELSE solved_by END,
      updated_at = now()
  WHERE id = target_lock.id;

  INSERT INTO arcane_lock_actions(action_id, lock_id, actor_user_id, actor_type, generation, version_before, version_after, action_type, action_payload, result_summary)
  VALUES (action_id, target_lock.id, auth.uid(), member_role, target_lock.generation, target_lock.version, next_version, action_payload->>'type', action_payload, jsonb_build_object('message', result_message, 'solved', solved_result));

  RETURN (
    SELECT jsonb_build_object(
      'id', lock.id,
      'sessionId', lock.session_id,
      'templateId', template.template_key,
      'displayName', lock.display_name,
      'tabOrder', lock.tab_order,
      'status', lock.status,
      'version', lock.version,
      'generation', lock.generation,
      'solvedAt', lock.solved_at,
      'viewerCount', 0,
      'currentState', lock.current_state
    )
    FROM arcane_lock_instances lock
    JOIN arcane_lock_templates template ON template.id = lock.template_id
    WHERE lock.id = target_lock.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_arcane_lock(target_lock_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_lock arcane_lock_instances%ROWTYPE;
BEGIN
  SELECT * INTO target_lock FROM arcane_lock_instances WHERE id = target_lock_id FOR UPDATE;
  IF NOT public.arcane_is_session_gm(target_lock.session_id) THEN RAISE EXCEPTION 'GM only'; END IF;
  UPDATE arcane_lock_instances
  SET current_state = initial_state, generation = generation + 1, version = 1, status = 'active', solved_at = NULL, solved_by = NULL, updated_at = now()
  WHERE id = target_lock_id;
  INSERT INTO arcane_lock_actions(action_id, lock_id, actor_user_id, actor_type, generation, version_before, version_after, action_type, action_payload, result_summary)
  VALUES (gen_random_uuid(), target_lock_id, auth.uid(), 'gm', target_lock.generation + 1, target_lock.version, 1, 'reset', '{}'::jsonb, jsonb_build_object('message', 'Lock reset'));
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_arcane_session_locks(target_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.reset_arcane_lock(id)
  FROM arcane_lock_instances
  WHERE session_id = target_session_id
    AND public.arcane_is_session_gm(target_session_id);
$$;

CREATE OR REPLACE FUNCTION public.set_arcane_session_status(target_session_id uuid, next_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF next_status NOT IN ('draft', 'active', 'paused', 'completed', 'archived') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF NOT public.arcane_is_session_gm(target_session_id) THEN RAISE EXCEPTION 'GM only'; END IF;
  UPDATE arcane_puzzle_sessions
  SET status = next_status,
      started_at = CASE WHEN next_status = 'active' THEN COALESCE(started_at, now()) ELSE started_at END,
      ended_at = CASE WHEN next_status = 'completed' THEN now() ELSE ended_at END,
      archived_at = CASE WHEN next_status = 'archived' THEN now() ELSE archived_at END
  WHERE id = target_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_arcane_access_provider(target_session_id uuid, next_provider_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF next_provider_type NOT IN ('manual', 'foundry') THEN RAISE EXCEPTION 'Invalid provider'; END IF;
  IF NOT public.arcane_is_session_gm(target_session_id) THEN RAISE EXCEPTION 'GM only'; END IF;
  UPDATE arcane_puzzle_sessions SET access_provider_type = next_provider_type WHERE id = target_session_id;
  UPDATE arcane_lock_player_access access
  SET provider_type = next_provider_type, updated_by = auth.uid(), updated_at = now()
  FROM arcane_lock_instances lock
  WHERE lock.id = access.lock_id AND lock.session_id = target_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_arcane_lock_access(
  target_lock_id uuid,
  target_user_id uuid,
  provider_can_interact boolean DEFAULT NULL,
  provider_can_read boolean DEFAULT NULL,
  interact_override text DEFAULT NULL,
  read_override text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_session_id uuid;
BEGIN
  SELECT session_id INTO target_session_id FROM arcane_lock_instances WHERE id = target_lock_id;
  IF NOT public.arcane_is_session_gm(target_session_id) THEN RAISE EXCEPTION 'GM only'; END IF;
  UPDATE arcane_lock_player_access
  SET provider_can_interact = COALESCE(set_arcane_lock_access.provider_can_interact, arcane_lock_player_access.provider_can_interact),
      provider_can_read = COALESCE(set_arcane_lock_access.provider_can_read, arcane_lock_player_access.provider_can_read),
      interact_override = COALESCE(set_arcane_lock_access.interact_override, arcane_lock_player_access.interact_override),
      read_override = COALESCE(set_arcane_lock_access.read_override, arcane_lock_player_access.read_override),
      provider_updated_at = CASE WHEN provider_can_interact IS NOT NULL OR provider_can_read IS NOT NULL THEN now() ELSE provider_updated_at END,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE lock_id = target_lock_id AND user_id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_arcane_puzzle_sessions()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', session.id,
    'name', session.name,
    'status', session.status,
    'gmUserId', session.gm_user_id,
    'gmDisplayName', COALESCE(profile.username, 'GM'),
    'accessProviderType', session.access_provider_type,
    'lockCount', (SELECT count(*) FROM arcane_lock_instances WHERE session_id = session.id),
    'acceptedMemberCount', (SELECT count(*) FROM arcane_puzzle_session_members WHERE session_id = session.id AND invitation_status = 'accepted'),
    'currentUserRole', member.role,
    'invitationStatus', member.invitation_status
  ) ORDER BY session.created_at DESC), '[]'::jsonb)
  FROM arcane_puzzle_sessions session
  JOIN arcane_puzzle_session_members member ON member.session_id = session.id AND member.user_id = auth.uid()
  LEFT JOIN users profile ON profile.auth_user_id = session.gm_user_id::text
  WHERE session.status <> 'archived';
$$;

CREATE OR REPLACE FUNCTION public.seed_arcane_lock_templates()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO arcane_lock_templates(template_key, name, description, difficulty, public_definition, protected_definition)
  VALUES
    (
      'verdant-tutorial',
      'Verdant Seal',
      'Tutorial lock: Grass feeds Cow, Cow feeds Lion.',
      1,
      '{
        "id":"verdant-tutorial",
        "name":"Verdant Seal",
        "version":1,
        "difficulty":1,
        "obscuredInscription":"The inscription is too distant to decipher.",
        "rings":[
          {"id":"outer","name":"Outer Ring","radius":178,"glyphIds":["grass","rain","stone","wheat","moon","wind"],"startingRotation":0,"conduits":[{"sourceGlyphId":"grass","destinationOffset":1,"destinationRingId":"middle"}]},
          {"id":"middle","name":"Middle Ring","radius":125,"glyphIds":["river","tree","cow","fire","goat","eye"],"startingRotation":0,"conduits":[{"sourceGlyphId":"cow","destinationOffset":-1,"destinationRingId":"inner"}]},
          {"id":"inner","name":"Inner Ring","radius":73,"glyphIds":["lion","empty-slot","wolf","empty-slot","crown","bone"],"startingRotation":0,"conduits":[{"sourceGlyphId":"lion","destinationOffset":0}]}
        ],
        "obstacles":[],
        "initialRuntimeState":{"ringRotations":{"outer":0,"middle":0,"inner":0},"poweredGlyphByRing":{"outer":null,"middle":null,"inner":null},"obstacleStates":{},"energyTrace":[],"solved":false,"lastInvokeFailed":false}
      }'::jsonb,
      '{"inscription":"Grass feeds Cow. Cow feeds Lion.","translatedHint":"Power each creature in the order named by the inscription.","solutionRules":[{"id":"food-chain","chain":["grass","cow","lion"]}]}'::jsonb
    ),
    (
      'lunar-deciphering',
      'Lunar Seal',
      'Deciphering lock: Moon leads Tide, Tide leads River.',
      2,
      '{
        "id":"lunar-deciphering",
        "name":"Lunar Seal",
        "version":1,
        "difficulty":2,
        "obscuredInscription":"Distant runes shimmer in unreadable silver bands.",
        "rings":[
          {"id":"outer","name":"Cloud Ring","radius":182,"glyphIds":["moon","rain","star","eye","wind","stone","grass","fire"],"startingRotation":1,"conduits":[{"sourceGlyphId":"moon","destinationOffset":2,"destinationRingId":"middle"}]},
          {"id":"middle","name":"Tide Ring","radius":132,"glyphIds":["tide","river","smoke","tree","iron","cow","empty-slot","empty-slot"],"startingRotation":0,"conduits":[{"sourceGlyphId":"tide","destinationOffset":-2,"destinationRingId":"inner"}]},
          {"id":"inner","name":"River Ring","radius":78,"glyphIds":["river","bone","lion","wheat","crown","empty-slot","empty-slot","empty-slot"],"startingRotation":3,"conduits":[{"sourceGlyphId":"river","destinationOffset":0}]}
        ],
        "obstacles":[],
        "initialRuntimeState":{"ringRotations":{"outer":1,"middle":0,"inner":3},"poweredGlyphByRing":{"outer":null,"middle":null,"inner":null},"obstacleStates":{},"energyTrace":[],"solved":false,"lastInvokeFailed":false}
      }'::jsonb,
      '{"inscription":"The pale watcher draws the sea; the sea remembers the river.","translatedHint":"Moon leads Tide, and Tide leads River.","solutionRules":[{"id":"moon-tide-river","chain":["moon","tide","river"]}]}'::jsonb
    ),
    (
      'blood-routing',
      'Blood Seal',
      'Routing lock with a permanent ward and linked ring.',
      3,
      '{
        "id":"blood-routing",
        "name":"Blood Seal",
        "version":1,
        "difficulty":3,
        "obscuredInscription":"A red wax glare hides the inscription.",
        "rings":[
          {"id":"outer","name":"Hunger Ring","radius":188,"glyphIds":["wheat","grass","stone","rain","moon","wind","iron","star"],"startingRotation":0,"conduits":[{"sourceGlyphId":"wheat","destinationOffset":1,"destinationRingId":"second"}]},
          {"id":"second","name":"Horn Ring","radius":142,"glyphIds":["goat","cow","tree","fire","river","eye","bone","empty-slot"],"startingRotation":2,"conduits":[{"sourceGlyphId":"goat","destinationOffset":2,"destinationRingId":"third"}]},
          {"id":"third","name":"Fang Ring","radius":98,"glyphIds":["wolf","lion","smoke","crown","tide","grass","empty-slot","empty-slot"],"startingRotation":0,"conduits":[{"sourceGlyphId":"wolf","destinationOffset":-1,"destinationRingId":"inner"}],"linkedRing":{"ringId":"inner","ratio":1,"direction":-1}},
          {"id":"inner","name":"Ash Ring","radius":55,"glyphIds":["bone","fire","star","iron","empty-slot","empty-slot","empty-slot","empty-slot"],"startingRotation":1,"conduits":[{"sourceGlyphId":"bone","destinationOffset":0}]}
        ],
        "obstacles":[{"id":"ward-second-3","type":"ward","ringId":"third","blocks":[{"ringId":"third","slot":3}],"initialPosition":3}],
        "initialRuntimeState":{"ringRotations":{"outer":0,"second":2,"third":0,"inner":1},"poweredGlyphByRing":{"outer":null,"second":null,"third":null,"inner":null},"obstacleStates":{"ward-second-3":{"position":3,"active":true}},"energyTrace":[],"solved":false,"lastInvokeFailed":false}
      }'::jsonb,
      '{"inscription":"The field fills the horn, the horn calls the fang, the fang leaves bone.","translatedHint":"Wheat feeds Goat; Goat draws Wolf; Wolf leaves Bone. The ward blocks false power.","solutionRules":[{"id":"field-horn-fang-bone","chain":["wheat","goat","wolf","bone"]}]}'::jsonb
    ),
    (
      'eclipse-labyrinth',
      'Eclipse Labyrinth',
      'Expert lock using independent chains, duplicate sockets, skipped rings, return routing, branching, and a permanent blocker.',
      5,
      '{
        "id":"eclipse-labyrinth",
        "name":"Eclipse Labyrinth",
        "version":1,
        "difficulty":5,
        "obscuredInscription":"Layered eclipse runes fold over one another, too distant to separate.",
        "rings":[
          {"id":"outer","name":"Verdant Gate","radius":194,"glyphIds":["grass","stone","wind","fire","rain","iron","star","wheat"],"startingRotation":0,"conduits":[{"sourceGlyphId":"grass","destinationRingId":"middle","destinationSlot":0,"destinationOffset":0},{"sourceGlyphId":"grass","destinationRingId":"middle","destinationSlot":1,"destinationOffset":0}]},
          {"id":"lunar","name":"Twin Moon Ring","radius":152,"glyphIds":["moon","moon","eye","tide","crown","bone","empty-slot","empty-slot"],"glyphSockets":[{"id":"lunar-moon-true","glyphId":"moon"},{"id":"lunar-moon-false","glyphId":"moon"},{"id":"lunar-eye","glyphId":"eye"},{"id":"lunar-tide","glyphId":"tide"},{"id":"lunar-crown","glyphId":"crown"},{"id":"lunar-bone","glyphId":"bone"},{"id":"lunar-empty-6","glyphId":"empty-slot"},{"id":"lunar-empty-7","glyphId":"empty-slot"}],"startingRotation":0,"conduits":[{"sourceSocketId":"lunar-moon-true","destinationRingId":"deep","destinationSlot":0,"destinationOffset":0},{"sourceSocketId":"lunar-moon-false","destinationRingId":"middle","destinationSlot":1,"destinationOffset":0}]},
          {"id":"middle","name":"Horn Return","radius":112,"glyphIds":["cow","wolf","river","smoke","tree","goat","empty-slot","empty-slot"],"startingRotation":0,"conduits":[{"sourceGlyphId":"cow","destinationRingId":"outer","destinationSlot":0,"destinationOffset":0}]},
          {"id":"ward","name":"Ward Ring","radius":75,"glyphIds":["iron","stone","fire","wind","empty-slot","empty-slot","empty-slot","empty-slot"],"startingRotation":0,"conduits":[]},
          {"id":"deep","name":"Ocean Core Ring","radius":42,"glyphIds":["ocean","river","star","bone","empty-slot","empty-slot","empty-slot","empty-slot"],"startingRotation":0,"conduits":[]}
        ],
        "obstacles":[{"id":"false-hunger-block","type":"blocker","ringId":"middle","blocks":[{"ringId":"middle","slot":1}],"initialPosition":1}],
        "initialRuntimeState":{"ringRotations":{"outer":0,"lunar":0,"middle":0,"ward":0,"deep":0},"poweredGlyphByRing":{"outer":null,"lunar":null,"middle":null,"ward":null,"deep":null},"poweredSocketByRing":{"outer":null,"lunar":null,"middle":null,"ward":null,"deep":null},"obstacleStates":{"false-hunger-block":{"position":1,"active":true}},"energyTrace":[],"solved":false,"lastInvokeFailed":false}
      }'::jsonb,
      '{"inscription":"Grass feeds Cow, yet Cow remembers Grass. Of the twin moons, only the elder moon wakes the far Ocean. The false hunger must be barred.","translatedHint":"Power Grass, Cow, the elder Moon, and Ocean. Keep the ward blocking the false Grass branch.","solutionRules":[{"id":"grass-cow","chain":["grass","cow"]},{"id":"cow-remembers-grass","chain":["cow","grass"]},{"id":"elder-moon-ocean","chain":["lunar-moon-true","ocean"]}]}'::jsonb
    )
  ON CONFLICT (template_key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      difficulty = EXCLUDED.difficulty,
      public_definition = EXCLUDED.public_definition,
      protected_definition = EXCLUDED.protected_definition,
      updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.create_arcane_puzzle_session(session_name text, include_starter_locks boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_session_id uuid;
  template_row arcane_lock_templates%ROWTYPE;
  lock_row arcane_lock_instances%ROWTYPE;
BEGIN
  PERFORM public.seed_arcane_lock_templates();

  INSERT INTO arcane_puzzle_sessions(name, gm_user_id, status)
  VALUES (COALESCE(NULLIF(trim(session_name), ''), 'Arcane Lock Session'), auth.uid(), 'draft')
  RETURNING id INTO new_session_id;

  INSERT INTO arcane_puzzle_session_members(session_id, user_id, role, invitation_status, joined_at)
  VALUES (new_session_id, auth.uid(), 'gm', 'accepted', now());

  IF include_starter_locks THEN
    FOR template_row IN
      SELECT * FROM arcane_lock_templates
      WHERE template_key IN ('verdant-tutorial', 'lunar-deciphering', 'blood-routing', 'eclipse-labyrinth')
      ORDER BY difficulty
    LOOP
      INSERT INTO arcane_lock_instances(session_id, template_id, display_name, tab_order, initial_state, current_state)
      VALUES (
        new_session_id,
        template_row.id,
        template_row.name,
        template_row.difficulty - 1,
        template_row.public_definition->'initialRuntimeState',
        template_row.public_definition->'initialRuntimeState'
      )
      RETURNING * INTO lock_row;

      INSERT INTO arcane_lock_player_access(lock_id, user_id, provider_type, provider_can_interact, provider_can_read, provider_updated_at, updated_by)
      VALUES (lock_row.id, auth.uid(), 'manual', true, true, now(), auth.uid());
    END LOOP;
  END IF;

  RETURN new_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_arcane_session_user(target_session_id uuid, target_user_id uuid, target_role text DEFAULT 'player')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lock_row arcane_lock_instances%ROWTYPE;
BEGIN
  IF target_role NOT IN ('player', 'spectator') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  IF NOT public.arcane_is_session_gm(target_session_id) THEN RAISE EXCEPTION 'GM only'; END IF;

  INSERT INTO arcane_puzzle_session_members(session_id, user_id, role, invitation_status)
  VALUES (target_session_id, target_user_id, target_role, 'invited')
  ON CONFLICT (session_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      invitation_status = 'invited',
      removed_at = NULL,
      invited_at = now();

  FOR lock_row IN SELECT * FROM arcane_lock_instances WHERE session_id = target_session_id LOOP
    INSERT INTO arcane_lock_player_access(lock_id, user_id, provider_type, provider_can_interact, provider_can_read, provider_updated_at, updated_by)
    VALUES (lock_row.id, target_user_id, 'manual', false, false, now(), auth.uid())
    ON CONFLICT (lock_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_arcane_invitation(target_session_id uuid, next_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF next_status NOT IN ('accepted', 'declined') THEN RAISE EXCEPTION 'Invalid invitation response'; END IF;
  UPDATE arcane_puzzle_session_members
  SET invitation_status = next_status,
      joined_at = CASE WHEN next_status = 'accepted' THEN now() ELSE joined_at END
  WHERE session_id = target_session_id
    AND user_id = auth.uid()
    AND invitation_status = 'invited';
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_arcane_session_member(target_session_id uuid, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.arcane_is_session_gm(target_session_id) THEN RAISE EXCEPTION 'GM only'; END IF;
  UPDATE arcane_puzzle_session_members
  SET invitation_status = 'removed', removed_at = now()
  WHERE session_id = target_session_id
    AND user_id = target_user_id
    AND role <> 'gm';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_arcane_lock_view_for_current_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_lock_action(uuid, bigint, bigint, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_arcane_lock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_arcane_session_locks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_arcane_session_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_arcane_access_provider(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_arcane_lock_access(uuid, uuid, boolean, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_arcane_puzzle_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_arcane_lock_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_arcane_puzzle_session(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_arcane_session_user(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_arcane_invitation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_arcane_session_member(uuid, uuid) TO authenticated;

SELECT public.seed_arcane_lock_templates();

ALTER TABLE arcane_puzzle_sessions REPLICA IDENTITY FULL;
ALTER TABLE arcane_puzzle_session_members REPLICA IDENTITY FULL;
ALTER TABLE arcane_lock_instances REPLICA IDENTITY FULL;
ALTER TABLE arcane_lock_player_access REPLICA IDENTITY FULL;
ALTER TABLE arcane_lock_actions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'arcane_lock_instances') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE arcane_lock_instances;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'arcane_lock_player_access') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE arcane_lock_player_access;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'arcane_puzzle_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE arcane_puzzle_sessions;
  END IF;
END $$;
