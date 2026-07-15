/*
  # Site page visibility

  - Adds admin-controlled switches for public page availability.
  - Public visitors can read which pages are enabled.
  - Only site admins can change page visibility.
*/

CREATE OR REPLACE FUNCTION public.is_site_admin(check_user_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT users.is_admin FROM users WHERE users.auth_user_id = check_user_id),
    false
  );
$$;

CREATE TABLE IF NOT EXISTS site_pages (
  page_key text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_pages_known_page_key CHECK (
    page_key IN (
      'home',
      'about',
      'characters',
      'citizens',
      'guilds',
      'schedule',
      'games',
      'event',
      'skill-checks',
      'news'
    )
  )
);

INSERT INTO site_pages (page_key, is_enabled)
VALUES
  ('home', true),
  ('about', true),
  ('characters', true),
  ('citizens', true),
  ('guilds', true),
  ('schedule', true),
  ('games', true),
  ('event', true),
  ('skill-checks', true),
  ('news', true)
ON CONFLICT (page_key) DO NOTHING;

ALTER TABLE site_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read site page visibility" ON site_pages;
DROP POLICY IF EXISTS "Admins can create site page visibility" ON site_pages;
DROP POLICY IF EXISTS "Admins can update site page visibility" ON site_pages;
DROP POLICY IF EXISTS "Admins can delete site page visibility" ON site_pages;

CREATE POLICY "Anyone can read site page visibility"
  ON site_pages FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can create site page visibility"
  ON site_pages FOR INSERT TO authenticated
  WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Admins can update site page visibility"
  ON site_pages FOR UPDATE TO authenticated
  USING (public.is_site_admin(auth.uid()::text))
  WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Admins can delete site page visibility"
  ON site_pages FOR DELETE TO authenticated
  USING (public.is_site_admin(auth.uid()::text));

ALTER TABLE public.site_pages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'site_pages'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.site_pages;
  END IF;
END $$;
