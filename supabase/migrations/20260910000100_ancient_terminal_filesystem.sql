CREATE TABLE IF NOT EXISTS public.ancient_terminal_files (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('file', 'directory')),
  contents text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  is_protected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, path),
  CHECK (path = lower(path)),
  CHECK (length(path) BETWEEN 4 AND 160),
  CHECK (path = 'alias.tot' OR path ~ '^home(/[a-z0-9][a-z0-9_. -]{0,47})*$'),
  CHECK (path !~ '(^|/)\.{1,2}(/|$)'),
  CHECK (
    (kind = 'directory' AND contents IS NULL)
    OR (kind = 'file' AND contents IS NOT NULL AND length(contents) <= 65536)
  ),
  CHECK (kind <> 'file' OR right(path, 4) IN ('.oro', '.tot'))
);

ALTER TABLE public.ancient_terminal_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ancient_terminal_files FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_ancient_terminal_file_path(p_path text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_path text := lower(trim(replace(coalesce(p_path, ''), E'\\', '/')));
BEGIN
  IF normalized_path = 'c:/ancient/home' THEN
    normalized_path := 'home';
  ELSIF starts_with(normalized_path, 'c:/ancient/') THEN
    normalized_path := substring(normalized_path FROM 12);
  END IF;
  normalized_path := regexp_replace(normalized_path, '/+', '/', 'g');
  normalized_path := regexp_replace(normalized_path, '/$', '');

  IF normalized_path <> 'alias.tot'
    AND (normalized_path !~ '^home(/[a-z0-9][a-z0-9_. -]{0,47})*$'
    OR normalized_path ~ '(^|/)\.{1,2}(/|$)'
    OR length(normalized_path) > 160) THEN
    RAISE EXCEPTION 'Path must remain beneath C:\ANCIENT\HOME';
  END IF;
  RETURN normalized_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ancient_terminal_files()
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

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'path', file_row.path,
      'kind', file_row.kind,
      'contents', file_row.contents,
      'revision', file_row.revision,
      'updatedAt', file_row.updated_at
    ) ORDER BY file_row.path)
    FROM public.ancient_terminal_files AS file_row
    WHERE file_row.user_id = actor_id AND file_row.path <> 'alias.tot'
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.write_ancient_terminal_file_command(
  p_path text,
  p_contents text,
  p_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  normalized_path text := public.normalize_ancient_terminal_file_path(p_path);
  parent_path text;
  current_revision integer;
  protected_file boolean;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF normalized_path = 'alias.tot' THEN
    RAISE EXCEPTION 'alias.tot is managed by the ALIAS command';
  END IF;
  IF normalized_path = 'home' OR right(normalized_path, 4) NOT IN ('.oro', '.tot') THEN
    RAISE EXCEPTION 'Writable files must use .oro or .tot';
  END IF;
  IF p_contents IS NULL OR length(p_contents) > 65536 THEN
    RAISE EXCEPTION 'File exceeds the 65536 character limit';
  END IF;

  parent_path := regexp_replace(normalized_path, '/[^/]+$', '');
  IF parent_path <> 'home' AND NOT EXISTS (
    SELECT 1 FROM public.ancient_terminal_files
    WHERE user_id = actor_id AND path = parent_path AND kind = 'directory'
  ) THEN
    RAISE EXCEPTION 'Parent directory does not exist';
  END IF;

  SELECT revision, is_protected INTO current_revision, protected_file
  FROM public.ancient_terminal_files
  WHERE user_id = actor_id AND path = normalized_path;

  IF FOUND THEN
    IF protected_file THEN RAISE EXCEPTION 'File is protected'; END IF;
    IF p_expected_revision IS NULL OR p_expected_revision <> current_revision THEN
      RAISE EXCEPTION 'File revision conflict';
    END IF;
    UPDATE public.ancient_terminal_files
    SET contents = p_contents, revision = revision + 1, updated_at = now()
    WHERE user_id = actor_id AND path = normalized_path;
  ELSE
    IF coalesce(p_expected_revision, -1) <> 0 THEN
      RAISE EXCEPTION 'New files require expected revision 0';
    END IF;
    INSERT INTO public.ancient_terminal_files (user_id, path, kind, contents)
    VALUES (actor_id, normalized_path, 'file', p_contents);
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'path', path,
      'kind', kind,
      'contents', contents,
      'revision', revision,
      'updatedAt', updated_at
    )
    FROM public.ancient_terminal_files
    WHERE user_id = actor_id AND path = normalized_path
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.copy_ancient_terminal_file_command(
  p_source_path text,
  p_target_path text,
  p_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  source_path text := public.normalize_ancient_terminal_file_path(p_source_path);
  target_path text := public.normalize_ancient_terminal_file_path(p_target_path);
  parent_path text;
  source_row public.ancient_terminal_files%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF source_path !~ '^home/' OR target_path !~ '^home/' THEN
    RAISE EXCEPTION 'COPY is restricted to C:\ANCIENT\HOME';
  END IF;
  SELECT * INTO source_row FROM public.ancient_terminal_files
  WHERE user_id = actor_id AND path = source_path;
  IF NOT FOUND OR source_row.kind <> 'file' THEN RAISE EXCEPTION 'Source file not found'; END IF;
  IF p_expected_revision IS NULL OR source_row.revision <> p_expected_revision THEN RAISE EXCEPTION 'File revision conflict'; END IF;
  IF right(target_path, 4) NOT IN ('.oro', '.tot') THEN RAISE EXCEPTION 'Target must use .oro or .tot'; END IF;
  IF EXISTS (SELECT 1 FROM public.ancient_terminal_files WHERE user_id = actor_id AND path = target_path) THEN
    RAISE EXCEPTION 'Target path already exists';
  END IF;
  parent_path := regexp_replace(target_path, '/[^/]+$', '');
  IF parent_path <> 'home' AND NOT EXISTS (
    SELECT 1 FROM public.ancient_terminal_files
    WHERE user_id = actor_id AND path = parent_path AND kind = 'directory'
  ) THEN RAISE EXCEPTION 'Target directory does not exist'; END IF;

  INSERT INTO public.ancient_terminal_files (user_id, path, kind, contents)
  VALUES (actor_id, target_path, 'file', source_row.contents);
  RETURN (
    SELECT jsonb_build_object('path', path, 'kind', kind, 'contents', contents, 'revision', revision, 'updatedAt', updated_at)
    FROM public.ancient_terminal_files WHERE user_id = actor_id AND path = target_path
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.move_ancient_terminal_entry_command(
  p_source_path text,
  p_target_path text,
  p_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  source_path text := public.normalize_ancient_terminal_file_path(p_source_path);
  target_path text := public.normalize_ancient_terminal_file_path(p_target_path);
  parent_path text;
  source_row public.ancient_terminal_files%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF source_path !~ '^home/' OR target_path !~ '^home/' THEN
    RAISE EXCEPTION 'MOVE is restricted to C:\ANCIENT\HOME';
  END IF;
  SELECT * INTO source_row FROM public.ancient_terminal_files
  WHERE user_id = actor_id AND path = source_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source path not found'; END IF;
  IF source_row.is_protected THEN RAISE EXCEPTION 'Source path is protected'; END IF;
  IF p_expected_revision IS NULL OR source_row.revision <> p_expected_revision THEN RAISE EXCEPTION 'File revision conflict'; END IF;
  IF source_row.kind = 'file' AND right(target_path, 4) NOT IN ('.oro', '.tot') THEN
    RAISE EXCEPTION 'Target must use .oro or .tot';
  END IF;
  IF source_row.kind = 'directory' AND starts_with(target_path, source_path || '/') THEN
    RAISE EXCEPTION 'Cannot move a directory inside itself';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ancient_terminal_files WHERE user_id = actor_id AND path = target_path) THEN
    RAISE EXCEPTION 'Target path already exists';
  END IF;
  parent_path := regexp_replace(target_path, '/[^/]+$', '');
  IF parent_path <> 'home' AND NOT EXISTS (
    SELECT 1 FROM public.ancient_terminal_files
    WHERE user_id = actor_id AND path = parent_path AND kind = 'directory'
  ) THEN RAISE EXCEPTION 'Target directory does not exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.ancient_terminal_files AS source_child
    JOIN public.ancient_terminal_files AS target_child
      ON target_child.user_id = actor_id
      AND target_child.path = target_path || substring(source_child.path FROM length(source_path) + 1)
    WHERE source_child.user_id = actor_id
      AND (source_child.path = source_path OR source_child.path LIKE source_path || '/%')
  ) THEN RAISE EXCEPTION 'A target path already exists'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.ancient_terminal_files
    WHERE user_id = actor_id AND path LIKE source_path || '/%'
      AND length(target_path || substring(path FROM length(source_path) + 1)) > 160
  ) THEN RAISE EXCEPTION 'Moved path exceeds the path length limit'; END IF;

  UPDATE public.ancient_terminal_files
  SET path = target_path || substring(path FROM length(source_path) + 1),
      revision = revision + 1,
      updated_at = now()
  WHERE user_id = actor_id AND (path = source_path OR path LIKE source_path || '/%');
  RETURN public.get_ancient_terminal_files();
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_ancient_terminal_alias_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  alias_contents text;
BEGIN
  IF NEW.aliases = '{}'::jsonb THEN
    DELETE FROM public.ancient_terminal_files WHERE user_id = NEW.user_id AND path = 'alias.tot';
    RETURN NEW;
  END IF;
  SELECT '# alias.tot' || E'\n# last definition wins\n\n' ||
    string_agg('alias ' || key || ' - ' || value, E'\n' ORDER BY key) || E'\n'
  INTO alias_contents
  FROM jsonb_each_text(NEW.aliases);

  INSERT INTO public.ancient_terminal_files (user_id, path, kind, contents, is_protected)
  VALUES (NEW.user_id, 'alias.tot', 'file', alias_contents, true)
  ON CONFLICT (user_id, path) DO UPDATE
  SET contents = EXCLUDED.contents,
      revision = public.ancient_terminal_files.revision + 1,
      is_protected = true,
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_ancient_terminal_alias_file_trigger ON public.ancient_terminal_progress;
CREATE TRIGGER sync_ancient_terminal_alias_file_trigger
AFTER INSERT OR UPDATE OF aliases ON public.ancient_terminal_progress
FOR EACH ROW EXECUTE FUNCTION public.sync_ancient_terminal_alias_file();

INSERT INTO public.ancient_terminal_files (user_id, path, kind, contents, is_protected)
SELECT progress.user_id, 'alias.tot', 'file',
  '# alias.tot' || E'\n# last definition wins\n\n' ||
    (SELECT string_agg('alias ' || key || ' - ' || value, E'\n' ORDER BY key) FROM jsonb_each_text(progress.aliases)) || E'\n',
  true
FROM public.ancient_terminal_progress AS progress
WHERE progress.aliases <> '{}'::jsonb
ON CONFLICT (user_id, path) DO UPDATE
SET contents = EXCLUDED.contents, is_protected = true, updated_at = now();

CREATE OR REPLACE FUNCTION public.create_ancient_terminal_directory_command(p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  normalized_path text := public.normalize_ancient_terminal_file_path(p_path);
  parent_path text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF normalized_path = 'home' THEN RAISE EXCEPTION 'HOME already exists'; END IF;
  parent_path := regexp_replace(normalized_path, '/[^/]+$', '');
  IF parent_path <> 'home' AND NOT EXISTS (
    SELECT 1 FROM public.ancient_terminal_files
    WHERE user_id = actor_id AND path = parent_path AND kind = 'directory'
  ) THEN
    RAISE EXCEPTION 'Parent directory does not exist';
  END IF;

  INSERT INTO public.ancient_terminal_files (user_id, path, kind, contents)
  VALUES (actor_id, normalized_path, 'directory', NULL);

  RETURN jsonb_build_object('path', normalized_path, 'kind', 'directory', 'contents', NULL, 'revision', 1);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Path already exists';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_ancient_terminal_file_command(p_path text, p_expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  normalized_path text := public.normalize_ancient_terminal_file_path(p_path);
  target_row public.ancient_terminal_files%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO target_row FROM public.ancient_terminal_files
  WHERE user_id = actor_id AND path = normalized_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'Path not found'; END IF;
  IF target_row.is_protected THEN RAISE EXCEPTION 'Path is protected'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision <> target_row.revision THEN
    RAISE EXCEPTION 'File revision conflict';
  END IF;
  IF target_row.kind = 'directory' AND EXISTS (
    SELECT 1 FROM public.ancient_terminal_files
    WHERE user_id = actor_id AND path LIKE normalized_path || '/%'
  ) THEN
    RAISE EXCEPTION 'Directory is not empty';
  END IF;

  DELETE FROM public.ancient_terminal_files
  WHERE user_id = actor_id AND path = normalized_path;
  RETURN jsonb_build_object('deleted', normalized_path);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_ancient_terminal_progress_command()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  DELETE FROM public.ancient_terminal_files WHERE user_id = actor_id;
  DELETE FROM public.ancient_terminal_progress WHERE user_id = actor_id;
  INSERT INTO public.ancient_terminal_progress (user_id) VALUES (actor_id);
  RETURN public.get_ancient_terminal_progress();
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_ancient_terminal_file_path(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ancient_terminal_files() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_ancient_terminal_file_command(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_ancient_terminal_directory_command(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_ancient_terminal_file_command(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.copy_ancient_terminal_file_command(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_ancient_terminal_entry_command(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_ancient_terminal_alias_file() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ancient_terminal_files() TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_ancient_terminal_file_command(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ancient_terminal_directory_command(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ancient_terminal_file_command(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_ancient_terminal_file_command(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_ancient_terminal_entry_command(text, text, integer) TO authenticated;
