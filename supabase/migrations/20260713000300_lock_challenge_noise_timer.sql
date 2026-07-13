/*
  # Lock challenge noise and timers

  Adds noise/alert state, optional timer settings, and player visibility toggles
  to lock challenges. Public RPCs continue to return only token-safe fields.
*/

ALTER TABLE lock_challenges
  ADD COLUMN IF NOT EXISTS noise_level numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS was_alerted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS time_limit_seconds integer,
  ADD COLUMN IF NOT EXISTS timer_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS show_noise_meter boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_timer boolean NOT NULL DEFAULT true;

ALTER TABLE lock_challenges
  DROP CONSTRAINT IF EXISTS lock_challenges_time_limit_seconds_check;

ALTER TABLE lock_challenges
  ADD CONSTRAINT lock_challenges_time_limit_seconds_check
  CHECK (time_limit_seconds IS NULL OR (time_limit_seconds >= 5 AND time_limit_seconds <= 3600));

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
  noise_level numeric,
  was_alerted boolean,
  timer_enabled boolean,
  time_limit_seconds integer,
  timer_started_at timestamptz,
  show_noise_meter boolean,
  show_timer boolean,
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
    lc.noise_level,
    lc.was_alerted,
    lc.timer_enabled,
    lc.time_limit_seconds,
    lc.timer_started_at,
    lc.show_noise_meter,
    lc.show_timer,
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
  noise_level numeric,
  was_alerted boolean,
  timer_enabled boolean,
  time_limit_seconds integer,
  timer_started_at timestamptz,
  show_noise_meter boolean,
  show_timer boolean,
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
    lc.noise_level,
    lc.was_alerted,
    lc.timer_enabled,
    lc.time_limit_seconds,
    lc.timer_started_at,
    lc.show_noise_meter,
    lc.show_timer,
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

DROP FUNCTION IF EXISTS public.update_lock_challenge_player_state(uuid, text, numeric, numeric, numeric, integer, integer, text, boolean, boolean, text);

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
  next_status text,
  next_noise_level numeric,
  next_was_alerted boolean,
  next_timer_started_at timestamptz
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
  noise_level numeric,
  was_alerted boolean,
  timer_enabled boolean,
  time_limit_seconds integer,
  timer_started_at timestamptz,
  show_noise_meter boolean,
  show_timer boolean,
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
    noise_level = next_noise_level,
    was_alerted = next_was_alerted,
    timer_started_at = COALESCE(lc.timer_started_at, next_timer_started_at),
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
    lc.noise_level,
    lc.was_alerted,
    lc.timer_enabled,
    lc.time_limit_seconds,
    lc.timer_started_at,
    lc.show_noise_meter,
    lc.show_timer,
    lc.completed_at,
    lc.closed_at,
    lc.created_at,
    lc.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lock_challenge_player_state(uuid, text, numeric, numeric, numeric, integer, integer, text, boolean, boolean, text, numeric, boolean, timestamptz) TO anon, authenticated;
