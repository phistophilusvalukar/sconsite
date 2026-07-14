DROP FUNCTION IF EXISTS public.get_lock_challenge_for_player(uuid, text);
DROP FUNCTION IF EXISTS public.get_lock_challenge_for_spectator(uuid, text);

CREATE OR REPLACE FUNCTION public.get_lock_challenge_for_player(
  challenge_id uuid,
  access_token text
)
RETURNS TABLE (
  id uuid,
  gm_id text,
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
    lc.gm_id,
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
  gm_id text,
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
    lc.gm_id,
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
    AND lc.spectator_token = access_token
    AND lc.status <> 'Closed'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_lock_challenge_for_player(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lock_challenge_for_spectator(uuid, text) TO anon, authenticated;
