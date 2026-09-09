CREATE TABLE IF NOT EXISTS public.ancient_terminal_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  script_fixed boolean NOT NULL DEFAULT false,
  eldritch_awakened boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT eldritch_awakened OR script_fixed)
);

ALTER TABLE public.ancient_terminal_progress ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ancient_terminal_progress FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_ancient_terminal_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  progress_row public.ancient_terminal_progress%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.ancient_terminal_progress (user_id)
  VALUES (actor_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO progress_row
  FROM public.ancient_terminal_progress
  WHERE user_id = actor_id;

  RETURN jsonb_build_object(
    'scriptFixed', progress_row.script_fixed,
    'eldritchAwakened', progress_row.eldritch_awakened
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_ancient_terminal_progress_command(p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  progress_row public.ancient_terminal_progress%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.ancient_terminal_progress (user_id)
  VALUES (actor_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_action = 'fix_script' THEN
    UPDATE public.ancient_terminal_progress
    SET script_fixed = true, updated_at = now()
    WHERE user_id = actor_id;
  ELSIF p_action = 'awaken_eldritch' THEN
    UPDATE public.ancient_terminal_progress
    SET eldritch_awakened = true, updated_at = now()
    WHERE user_id = actor_id AND script_fixed = true;
  ELSE
    RAISE EXCEPTION 'Unknown ancient terminal action';
  END IF;

  SELECT * INTO progress_row FROM public.ancient_terminal_progress WHERE user_id = actor_id;
  RETURN jsonb_build_object(
    'scriptFixed', progress_row.script_fixed,
    'eldritchAwakened', progress_row.eldritch_awakened
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ancient_terminal_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_ancient_terminal_progress_command(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ancient_terminal_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_ancient_terminal_progress_command(text) TO authenticated;
