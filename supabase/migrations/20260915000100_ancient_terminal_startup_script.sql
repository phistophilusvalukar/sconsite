/* Player-editable Ouroboros boot plan. */
ALTER TABLE public.ancient_terminal_progress
  ADD COLUMN IF NOT EXISTS startup_source text NOT NULL DEFAULT $startup$# startup.oro
# Programs are resolved relative to C:\ANCIENT\SCRIPTS.
# Use ../HOME/folder/program.oro to run a script from HOME.
# Add or remove {path: "...", functions: ["..."]} entries in the returned list.

fn startup():
    return [{path: "./world_init.oro", functions: ["getTime", "getPop"]}]
$startup$ CHECK (length(startup_source) <= 65536);

CREATE OR REPLACE FUNCTION public.get_ancient_terminal_startup_source()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  result text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.ancient_terminal_progress (user_id) VALUES (actor_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT startup_source INTO result FROM public.ancient_terminal_progress WHERE user_id = actor_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_ancient_terminal_startup_command(p_source text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  normalized_source text := replace(coalesce(p_source, ''), E'\r\n', E'\n');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(normalized_source) > 65536 THEN RAISE EXCEPTION 'startup.oro exceeds 65536 characters'; END IF;

  INSERT INTO public.ancient_terminal_progress (user_id, startup_source)
  VALUES (actor_id, normalized_source)
  ON CONFLICT (user_id) DO UPDATE
    SET startup_source = EXCLUDED.startup_source, updated_at = now();
  RETURN normalized_source;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ancient_terminal_startup_source() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.write_ancient_terminal_startup_command(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ancient_terminal_startup_source() TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_ancient_terminal_startup_command(text) TO authenticated;
