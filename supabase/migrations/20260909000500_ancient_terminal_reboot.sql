CREATE OR REPLACE FUNCTION public.reset_ancient_terminal_progress_command()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.ancient_terminal_progress
  WHERE user_id = actor_id;

  INSERT INTO public.ancient_terminal_progress (user_id)
  VALUES (actor_id);

  RETURN public.get_ancient_terminal_progress();
END;
$$;

REVOKE ALL ON FUNCTION public.reset_ancient_terminal_progress_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_ancient_terminal_progress_command() TO authenticated;
