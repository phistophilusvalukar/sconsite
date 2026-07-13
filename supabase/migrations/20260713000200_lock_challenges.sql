/*
  # Lock challenges

  Adds GM-created lockpicking challenges with token-gated player and spectator
  RPC access. Public RPCs return only challenge state and never return access
  tokens; only the authenticated GM can read token URLs from the table.
*/

CREATE TABLE IF NOT EXISTS lock_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gm_id text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  gm_name text NOT NULL DEFAULT 'GM',
  difficulty text NOT NULL CHECK (difficulty IN ('Training', 'Standard', 'Expert', 'Master')),
  pick_count integer NOT NULL DEFAULT 3 CHECK (pick_count >= 1 AND pick_count <= 20),
  player_token text NOT NULL UNIQUE,
  spectator_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Success', 'Failure', 'Closed')),
  sweet_spot integer NOT NULL,
  pick_angle numeric NOT NULL DEFAULT 0,
  rotation numeric NOT NULL DEFAULT 0,
  pick_health numeric NOT NULL DEFAULT 100,
  picks_remaining integer NOT NULL DEFAULT 3,
  broken_picks integer NOT NULL DEFAULT 0,
  last_result text NOT NULL DEFAULT 'Awaiting thievery check',
  is_testing boolean NOT NULL DEFAULT false,
  is_unlocked boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lock_challenges_gm ON lock_challenges(gm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lock_challenges_status ON lock_challenges(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lock_challenges_player_token ON lock_challenges(player_token);
CREATE INDEX IF NOT EXISTS idx_lock_challenges_spectator_token ON lock_challenges(spectator_token);

ALTER TABLE lock_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "GMs can create lock challenges" ON lock_challenges;
DROP POLICY IF EXISTS "GMs can read their lock challenges" ON lock_challenges;
DROP POLICY IF EXISTS "GMs can close their lock challenges" ON lock_challenges;

CREATE POLICY "GMs can create lock challenges"
  ON lock_challenges FOR INSERT TO authenticated
  WITH CHECK (gm_id = auth.uid()::text);

CREATE POLICY "GMs can read their lock challenges"
  ON lock_challenges FOR SELECT TO authenticated
  USING (gm_id = auth.uid()::text);

CREATE POLICY "GMs can close their lock challenges"
  ON lock_challenges FOR UPDATE TO authenticated
  USING (gm_id = auth.uid()::text)
  WITH CHECK (gm_id = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.get_lock_challenge_for_player(
  challenge_id uuid,
  access_token text
)
RETURNS TABLE (
  id uuid,
  gm_name text,
  difficulty text,
  pick_count integer,
  status text,
  sweet_spot integer,
  pick_angle numeric,
  rotation numeric,
  pick_health numeric,
  picks_remaining integer,
  broken_picks integer,
  last_result text,
  is_testing boolean,
  is_unlocked boolean,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lc.id,
    lc.gm_name,
    lc.difficulty,
    lc.pick_count,
    lc.status,
    lc.sweet_spot,
    lc.pick_angle,
    lc.rotation,
    lc.pick_health,
    lc.picks_remaining,
    lc.broken_picks,
    lc.last_result,
    lc.is_testing,
    lc.is_unlocked,
    lc.completed_at,
    lc.closed_at,
    lc.created_at,
    lc.updated_at
  FROM lock_challenges lc
  WHERE lc.id = challenge_id
    AND lc.player_token = access_token
    AND lc.status <> 'Closed'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_lock_challenge_for_spectator(
  challenge_id uuid,
  access_token text
)
RETURNS TABLE (
  id uuid,
  gm_name text,
  difficulty text,
  pick_count integer,
  status text,
  pick_angle numeric,
  rotation numeric,
  pick_health numeric,
  picks_remaining integer,
  broken_picks integer,
  last_result text,
  is_testing boolean,
  is_unlocked boolean,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lc.id,
    lc.gm_name,
    lc.difficulty,
    lc.pick_count,
    lc.status,
    lc.pick_angle,
    lc.rotation,
    lc.pick_health,
    lc.picks_remaining,
    lc.broken_picks,
    lc.last_result,
    lc.is_testing,
    lc.is_unlocked,
    lc.completed_at,
    lc.closed_at,
    lc.created_at,
    lc.updated_at
  FROM lock_challenges lc
  WHERE lc.id = challenge_id
    AND lc.spectator_token = access_token
    AND lc.status <> 'Closed'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.update_lock_challenge_player_state(
  challenge_id uuid,
  access_token text,
  next_pick_angle numeric,
  next_rotation numeric,
  next_pick_health numeric,
  next_picks_remaining integer,
  next_broken_picks integer,
  next_last_result text,
  next_is_testing boolean,
  next_is_unlocked boolean,
  next_status text
)
RETURNS TABLE (
  id uuid,
  gm_name text,
  difficulty text,
  pick_count integer,
  status text,
  sweet_spot integer,
  pick_angle numeric,
  rotation numeric,
  pick_health numeric,
  picks_remaining integer,
  broken_picks integer,
  last_result text,
  is_testing boolean,
  is_unlocked boolean,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF next_status NOT IN ('Active', 'Success', 'Failure') THEN
    RAISE EXCEPTION 'Invalid lock challenge status';
  END IF;

  RETURN QUERY
  UPDATE lock_challenges lc
  SET
    pick_angle = next_pick_angle,
    rotation = next_rotation,
    pick_health = next_pick_health,
    picks_remaining = next_picks_remaining,
    broken_picks = next_broken_picks,
    last_result = next_last_result,
    is_testing = next_is_testing,
    is_unlocked = next_is_unlocked,
    status = next_status,
    completed_at = CASE
      WHEN next_status IN ('Success', 'Failure') THEN COALESCE(lc.completed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE lc.id = challenge_id
    AND lc.player_token = access_token
    AND lc.status = 'Active'
  RETURNING
    lc.id,
    lc.gm_name,
    lc.difficulty,
    lc.pick_count,
    lc.status,
    lc.sweet_spot,
    lc.pick_angle,
    lc.rotation,
    lc.pick_health,
    lc.picks_remaining,
    lc.broken_picks,
    lc.last_result,
    lc.is_testing,
    lc.is_unlocked,
    lc.completed_at,
    lc.closed_at,
    lc.created_at,
    lc.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lock_challenge_for_player(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lock_challenge_for_spectator(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_lock_challenge_player_state(uuid, text, numeric, numeric, numeric, integer, integer, text, boolean, boolean, text) TO anon, authenticated;

ALTER TABLE lock_challenges REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lock_challenges'
  )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lock_challenges;
  END IF;
END $$;
