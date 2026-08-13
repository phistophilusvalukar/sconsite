/*
  # Rules and living lore

  - Adds Rules and Lore to site page visibility.
  - Adds a protected loremaster role and an editable lore atlas.
  - All lore writes and role assignments pass through authorized server commands.
*/

ALTER TABLE public.site_pages
  DROP CONSTRAINT IF EXISTS site_pages_known_page_key;

ALTER TABLE public.site_pages
  ADD CONSTRAINT site_pages_known_page_key CHECK (
    page_key IN (
      'home',
      'about',
      'lore',
      'characters',
      'citizens',
      'guilds',
      'schedule',
      'games',
      'arcana',
      'underhaul-contracts',
      'arcane-locks',
      'broken-seals',
      'citadel-tactics',
      'tactical-puzzles',
      'campaign-objectives',
      'event',
      'skill-checks',
      'news'
    )
  );

INSERT INTO public.site_pages (page_key, is_enabled)
VALUES ('lore', true)
ON CONFLICT (page_key) DO NOTHING;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_loremaster boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_client_loremaster_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    IF TG_OP = 'INSERT' AND NEW.is_loremaster = true THEN
      RAISE EXCEPTION 'Client sessions cannot grant loremaster access';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.is_loremaster IS DISTINCT FROM OLD.is_loremaster THEN
      RAISE EXCEPTION 'Client sessions cannot change loremaster access';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_client_loremaster_changes_trigger ON public.users;
CREATE TRIGGER prevent_client_loremaster_changes_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_loremaster_changes();

CREATE OR REPLACE FUNCTION public.is_loremaster(check_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT users.is_admin OR users.is_loremaster
      FROM public.users
      WHERE users.auth_user_id = check_user_id
    ),
    false
  );
$$;

CREATE TABLE IF NOT EXISTS public.lore_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id text REFERENCES public.users(auth_user_id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT 'The Loremaster',
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 100),
  slug text NOT NULL UNIQUE,
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 2 AND 500),
  body_html text NOT NULL CHECK (char_length(body_html) BETWEEN 2 AND 30000),
  category text NOT NULL CHECK (category IN ('Places', 'People', 'Factions', 'History', 'Mysteries', 'Artifacts')),
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  image_url text NOT NULL DEFAULT '',
  is_featured boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lore_entries_publication_idx ON public.lore_entries(status, is_featured DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS lore_entries_category_idx ON public.lore_entries(category);
CREATE INDEX IF NOT EXISTS lore_entries_tags_idx ON public.lore_entries USING gin(tags);

ALTER TABLE public.lore_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published lore" ON public.lore_entries;
DROP POLICY IF EXISTS "Loremasters can read all lore" ON public.lore_entries;

CREATE POLICY "Anyone can read published lore"
  ON public.lore_entries FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Loremasters can read all lore"
  ON public.lore_entries FOR SELECT TO authenticated
  USING (public.is_loremaster(auth.uid()::text));

CREATE OR REPLACE FUNCTION public.save_lore_entry_command(
  p_entry_id uuid,
  p_entry jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id text := auth.uid()::text;
  saved_id uuid;
  entry_title text := btrim(COALESCE(p_entry->>'title', ''));
  entry_summary text := btrim(COALESCE(p_entry->>'summary', ''));
  entry_body text := btrim(COALESCE(p_entry->>'body_html', ''));
  entry_category text := COALESCE(p_entry->>'category', 'Mysteries');
  entry_status text := COALESCE(p_entry->>'status', 'draft');
  entry_image text := btrim(COALESCE(p_entry->>'image_url', ''));
  entry_featured boolean := COALESCE((p_entry->>'is_featured')::boolean, false);
  entry_tags text[];
  entry_slug text;
  slug_base text;
  slug_suffix integer := 2;
  actor_name text;
BEGIN
  IF actor_id IS NULL OR NOT public.is_loremaster(actor_id) THEN
    RAISE EXCEPTION 'Loremaster access required';
  END IF;
  IF char_length(entry_title) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Title must be between 2 and 100 characters'; END IF;
  IF char_length(entry_summary) NOT BETWEEN 2 AND 500 THEN RAISE EXCEPTION 'Summary must be between 2 and 500 characters'; END IF;
  IF char_length(entry_body) NOT BETWEEN 2 AND 30000 THEN RAISE EXCEPTION 'Lore entry must be between 2 and 30000 characters'; END IF;
  IF entry_category NOT IN ('Places', 'People', 'Factions', 'History', 'Mysteries', 'Artifacts') THEN RAISE EXCEPTION 'Invalid lore category'; END IF;
  IF entry_status NOT IN ('draft', 'published') THEN RAISE EXCEPTION 'Invalid lore status'; END IF;
  IF entry_image <> '' AND (entry_image !~* '^https://') THEN RAISE EXCEPTION 'Lore images must use HTTPS'; END IF;
  IF entry_body ~* '<\s*(script|iframe|object|embed|style|form)' OR entry_body ~* 'on[a-z]+\s*=' OR entry_body ~* 'javascript\s*:' THEN
    RAISE EXCEPTION 'Unsafe HTML is not permitted';
  END IF;
  IF jsonb_typeof(COALESCE(p_entry->'tags', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Tags must be an array'; END IF;

  SELECT COALESCE(array_agg(tag ORDER BY tag), '{}') INTO entry_tags
  FROM (
    SELECT DISTINCT left(btrim(value), 40) AS tag
    FROM jsonb_array_elements_text(COALESCE(p_entry->'tags', '[]'::jsonb))
    WHERE btrim(value) <> ''
    LIMIT 12
  ) cleaned_tags;

  SELECT users.username INTO actor_name FROM public.users WHERE users.auth_user_id = actor_id;
  actor_name := COALESCE(NULLIF(actor_name, ''), 'The Loremaster');

  IF p_entry_id IS NULL THEN
    slug_base := trim(both '-' FROM regexp_replace(lower(entry_title), '[^a-z0-9]+', '-', 'g'));
    IF slug_base = '' THEN slug_base := 'lore-entry'; END IF;
    entry_slug := slug_base;
    WHILE EXISTS (SELECT 1 FROM public.lore_entries WHERE slug = entry_slug) LOOP
      entry_slug := slug_base || '-' || slug_suffix;
      slug_suffix := slug_suffix + 1;
    END LOOP;

    INSERT INTO public.lore_entries (
      author_id, author_name, title, slug, summary, body_html, category, tags,
      status, image_url, is_featured, published_at
    ) VALUES (
      actor_id, actor_name, entry_title, entry_slug, entry_summary, entry_body, entry_category, entry_tags,
      entry_status, entry_image, entry_featured, CASE WHEN entry_status = 'published' THEN now() ELSE NULL END
    ) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.lore_entries
    SET title = entry_title,
        summary = entry_summary,
        body_html = entry_body,
        category = entry_category,
        tags = entry_tags,
        status = entry_status,
        image_url = entry_image,
        is_featured = entry_featured,
        published_at = CASE
          WHEN entry_status = 'published' AND published_at IS NULL THEN now()
          WHEN entry_status = 'draft' THEN NULL
          ELSE published_at
        END,
        updated_at = now()
    WHERE id = p_entry_id
    RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Lore entry not found'; END IF;
  END IF;

  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_lore_entry_command(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_loremaster(auth.uid()::text) THEN
    RAISE EXCEPTION 'Loremaster access required';
  END IF;
  DELETE FROM public.lore_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lore entry not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_loremaster_candidates_command(p_query text DEFAULT '')
RETURNS TABLE(user_id text, username text, avatar text, is_loremaster boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_site_admin(auth.uid()::text) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  RETURN QUERY
    SELECT users.auth_user_id, users.username, users.avatar, users.is_loremaster
    FROM public.users
    WHERE btrim(COALESCE(p_query, '')) = '' OR users.username ILIKE '%' || btrim(p_query) || '%'
    ORDER BY users.is_loremaster DESC, users.username
    LIMIT 30;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_loremaster_role_command(p_user_id text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_site_admin(auth.uid()::text) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  UPDATE public.users SET is_loremaster = p_enabled, updated_at = now() WHERE auth_user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_lore_entry_command(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_lore_entry_command(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_loremaster_candidates_command(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_loremaster_role_command(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_lore_entry_command(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_lore_entry_command(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_loremaster_candidates_command(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_loremaster_role_command(text, boolean) TO authenticated;

INSERT INTO public.lore_entries (author_name, title, slug, summary, body_html, category, tags, status, is_featured, published_at)
VALUES
  (
    'The First Record',
    'Ao',
    'ao',
    'The world upon which the lost gather, and the center of the Shattered Convergence.',
    '<p>Ao is a world shaped by arrivals. People and places displaced from elsewhere find themselves drawn into its orbit, carrying fragments of lives, cultures, and unfinished stories with them.</p><p>The Convergence threatens that precarious refuge, but it also makes Ao a place where no single origin defines what may come next.</p>',
    'Places',
    ARRAY['Ao', 'Convergence'],
    'published',
    true,
    now()
  ),
  (
    'The First Record',
    'Axiom',
    'axiom',
    'The great meeting place of Ao and the home from which many expeditions begin.',
    '<p>Axiom is the hub of the living world: a place where the displaced congregate, organize, trade knowledge, and prepare to face the instability beyond its familiar streets.</p><p>Its history reaches back to an ancient civilization, while its present is written daily by the citizens who return from the Convergence.</p>',
    'Places',
    ARRAY['Ao', 'Axiom'],
    'published',
    false,
    now()
  ),
  (
    'The First Record',
    'Wayfinders',
    'wayfinders',
    'Enigmatic instruments entrusted to those who venture through the Convergence.',
    '<p>Wayfinders are dispensed by an enigmatic entity and carried by those who cross unstable realms. Their purpose is inseparable from the expeditions that depart Axiom and the paths that lead those travelers home again.</p><p>Much about their maker, their limits, and their larger purpose remains uncertain.</p>',
    'Artifacts',
    ARRAY['Wayfinders', 'Convergence'],
    'published',
    false,
    now()
  )
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.lore_entries REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lore_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lore_entries;
  END IF;
END $$;
