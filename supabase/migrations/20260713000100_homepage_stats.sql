CREATE OR REPLACE FUNCTION public.get_homepage_stats()
RETURNS TABLE (
  active_players bigint,
  guilds bigint,
  adventures_completed bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT count(DISTINCT user_id)
      FROM public.characters
      WHERE is_active = true
    ) AS active_players,
    (
      SELECT count(*)
      FROM public.guilds
      WHERE status <> 'Inactive'
    ) AS guilds,
    (
      SELECT count(*)
      FROM public.games
      WHERE status = 'Completed'
    ) AS adventures_completed;
$$;

REVOKE ALL ON FUNCTION public.get_homepage_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_homepage_stats() TO anon, authenticated;
