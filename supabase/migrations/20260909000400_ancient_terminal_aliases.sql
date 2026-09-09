ALTER TABLE public.ancient_terminal_progress
  ADD COLUMN IF NOT EXISTS aliases jsonb NOT NULL DEFAULT '{}'::jsonb;

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
    'filesRestored', progress_row.files_restored,
    'aliases', progress_row.aliases
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

  RETURN public.get_ancient_terminal_progress();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ancient_terminal_alias_command(p_alias_name text, p_command text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  normalized_name text := lower(trim(p_alias_name));
  normalized_command text := trim(p_command);
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_alias_name IS NULL OR normalized_name !~ '^[a-z][a-z0-9_]*(\(\))?$' OR length(normalized_name) > 48 THEN
    RAISE EXCEPTION 'Invalid alias name';
  END IF;
  IF p_command IS NULL OR normalized_command = '' OR length(normalized_command) > 180 OR normalized_command ~ E'[\r\n]' THEN
    RAISE EXCEPTION 'Invalid alias command';
  END IF;

  INSERT INTO public.ancient_terminal_progress (user_id, aliases)
  VALUES (actor_id, jsonb_build_object(normalized_name, normalized_command))
  ON CONFLICT (user_id) DO UPDATE
  SET aliases = public.ancient_terminal_progress.aliases || jsonb_build_object(normalized_name, normalized_command),
      updated_at = now();

  RETURN public.get_ancient_terminal_progress();
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_ancient_terminal_aliases_command(p_aliases jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  alias_name text;
  alias_value jsonb;
  alias_command text;
  alias_count integer;
  normalized_aliases jsonb := '{}'::jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_aliases IS NULL OR jsonb_typeof(p_aliases) <> 'object' THEN
    RAISE EXCEPTION 'Invalid alias file';
  END IF;
  SELECT count(*) INTO alias_count FROM jsonb_object_keys(p_aliases);
  IF alias_count > 64 THEN
    RAISE EXCEPTION 'Alias file is too large';
  END IF;

  FOR alias_name, alias_value IN SELECT key, value FROM jsonb_each(p_aliases)
  LOOP
    alias_name := lower(trim(alias_name));
    IF alias_name !~ '^[a-z][a-z0-9_]*(\(\))?$' OR length(alias_name) > 48 OR jsonb_typeof(alias_value) <> 'string' THEN
      RAISE EXCEPTION 'Invalid alias definition';
    END IF;
    alias_command := trim(alias_value #>> '{}');
    IF alias_command = '' OR length(alias_command) > 180 OR alias_command ~ E'[\r\n]' THEN
      RAISE EXCEPTION 'Invalid alias command';
    END IF;
    normalized_aliases := normalized_aliases || jsonb_build_object(alias_name, alias_command);
  END LOOP;

  INSERT INTO public.ancient_terminal_progress (user_id, aliases)
  VALUES (actor_id, normalized_aliases)
  ON CONFLICT (user_id) DO UPDATE
  SET aliases = normalized_aliases, updated_at = now();

  RETURN public.get_ancient_terminal_progress();
END;
$$;

REVOKE ALL ON FUNCTION public.set_ancient_terminal_alias_command(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_ancient_terminal_aliases_command(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_ancient_terminal_alias_command(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_ancient_terminal_aliases_command(jsonb) TO authenticated;
