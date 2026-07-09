/*
  # News mini CMS

  - Add admin flag to user profiles.
  - Add news posts with draft/published workflow, categories, minor tags, summary, and body.
  - Add comments and likes for published posts.
*/

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_client_admin_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_admin = true AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Client sessions cannot grant admin access';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Client sessions cannot change admin access';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_client_admin_changes_trigger ON users;
CREATE TRIGGER prevent_client_admin_changes_trigger
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_admin_changes();

CREATE OR REPLACE FUNCTION public.is_news_admin(check_user_id text)
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

CREATE TABLE IF NOT EXISTS news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE RESTRICT,
  author_name text NOT NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  summary text NOT NULL,
  body text NOT NULL,
  category text NOT NULL CHECK (category IN ('Announcements', 'Events', 'Updates', 'Community')),
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  image_url text NOT NULL DEFAULT '/npc-placeholder.png',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_news_posts_status_published ON news_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_posts_category ON news_posts(category);
CREATE INDEX IF NOT EXISTS idx_news_posts_tags ON news_posts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_news_comments_post ON news_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_news_likes_post ON news_likes(post_id);

ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published news posts" ON news_posts;
DROP POLICY IF EXISTS "Admins can read all news posts" ON news_posts;
DROP POLICY IF EXISTS "Admins can create news posts" ON news_posts;
DROP POLICY IF EXISTS "Admins can update news posts" ON news_posts;
DROP POLICY IF EXISTS "Admins can delete news posts" ON news_posts;
DROP POLICY IF EXISTS "Anyone can read news comments" ON news_comments;
DROP POLICY IF EXISTS "Authenticated users can comment on published news" ON news_comments;
DROP POLICY IF EXISTS "Comment authors and admins can edit news comments" ON news_comments;
DROP POLICY IF EXISTS "Comment authors and admins can delete news comments" ON news_comments;
DROP POLICY IF EXISTS "Anyone can read news likes" ON news_likes;
DROP POLICY IF EXISTS "Authenticated users can like published news" ON news_likes;
DROP POLICY IF EXISTS "Users can unlike news" ON news_likes;

CREATE POLICY "Anyone can read published news posts"
  ON news_posts FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Admins can read all news posts"
  ON news_posts FOR SELECT TO authenticated
  USING (public.is_news_admin(auth.uid()::text));

CREATE POLICY "Admins can create news posts"
  ON news_posts FOR INSERT TO authenticated
  WITH CHECK (public.is_news_admin(auth.uid()::text) AND author_id = auth.uid()::text);

CREATE POLICY "Admins can update news posts"
  ON news_posts FOR UPDATE TO authenticated
  USING (public.is_news_admin(auth.uid()::text))
  WITH CHECK (public.is_news_admin(auth.uid()::text));

CREATE POLICY "Admins can delete news posts"
  ON news_posts FOR DELETE TO authenticated
  USING (public.is_news_admin(auth.uid()::text));

CREATE POLICY "Anyone can read news comments"
  ON news_comments FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM news_posts
      WHERE news_posts.id = news_comments.post_id
        AND news_posts.status = 'published'
    )
  );

CREATE POLICY "Authenticated users can comment on published news"
  ON news_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM news_posts
      WHERE news_posts.id = news_comments.post_id
        AND news_posts.status = 'published'
    )
  );

CREATE POLICY "Comment authors and admins can edit news comments"
  ON news_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()::text OR public.is_news_admin(auth.uid()::text))
  WITH CHECK (author_id = auth.uid()::text OR public.is_news_admin(auth.uid()::text));

CREATE POLICY "Comment authors and admins can delete news comments"
  ON news_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid()::text OR public.is_news_admin(auth.uid()::text));

CREATE POLICY "Anyone can read news likes"
  ON news_likes FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM news_posts
      WHERE news_posts.id = news_likes.post_id
        AND news_posts.status = 'published'
    )
  );

CREATE POLICY "Authenticated users can like published news"
  ON news_likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM news_posts
      WHERE news_posts.id = news_likes.post_id
        AND news_posts.status = 'published'
    )
  );

CREATE POLICY "Users can unlike news"
  ON news_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);
