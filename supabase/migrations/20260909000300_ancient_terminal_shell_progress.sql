ALTER TABLE public.ancient_terminal_progress
  ADD COLUMN IF NOT EXISTS help_updated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleaner_fixed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS files_restored boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ancient_terminal_files_require_cleaner'
      AND conrelid = 'public.ancient_terminal_progress'::regclass
  ) THEN
    ALTER TABLE public.ancient_terminal_progress
      ADD CONSTRAINT ancient_terminal_files_require_cleaner
      CHECK (NOT files_restored OR cleaner_fixed);
  END IF;
END;
$$;

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
    'eldritchAwakened', progress_row.eldritch_awakened,
    'helpUpdated', progress_row.help_updated,
    'cleanerFixed', progress_row.cleaner_fixed,
    'filesRestored', progress_row.files_restored
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
  ELSIF p_action = 'update_help' THEN
    UPDATE public.ancient_terminal_progress
    SET help_updated = true, updated_at = now()
    WHERE user_id = actor_id;
  ELSIF p_action = 'fix_cleaner' THEN
    UPDATE public.ancient_terminal_progress
    SET cleaner_fixed = true, updated_at = now()
    WHERE user_id = actor_id;
  ELSIF p_action = 'restore_files' THEN
    UPDATE public.ancient_terminal_progress
    SET files_restored = true, updated_at = now()
    WHERE user_id = actor_id AND cleaner_fixed = true;
  ELSE
    RAISE EXCEPTION 'Unknown ancient terminal action';
  END IF;

  SELECT * INTO progress_row
  FROM public.ancient_terminal_progress
  WHERE user_id = actor_id;

  RETURN jsonb_build_object(
    'scriptFixed', progress_row.script_fixed,
    'eldritchAwakened', progress_row.eldritch_awakened,
    'helpUpdated', progress_row.help_updated,
    'cleanerFixed', progress_row.cleaner_fixed,
    'filesRestored', progress_row.files_restored
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ancient_terminal_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_ancient_terminal_progress_command(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ancient_terminal_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_ancient_terminal_progress_command(text) TO authenticated;
