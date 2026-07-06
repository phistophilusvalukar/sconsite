/*
  # Move from custom Discord OAuth to Supabase Google Auth

  1. Schema
    - Rename users.discord_id to users.auth_user_id.
    - Keep the existing text foreign-key columns so old services can migrate cleanly.

  2. Security
    - Remove permissive development policies.
    - Require Supabase Auth for user-owned data.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'discord_id'
  ) THEN
    ALTER TABLE users RENAME COLUMN discord_id TO auth_user_id;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_users_discord_id;
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE wall_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read public profiles" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Allow profile creation" ON users;
DROP POLICY IF EXISTS "Users can read accessible profiles" ON users;
DROP POLICY IF EXISTS "Users can delete own profile" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON users;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON users;
DROP POLICY IF EXISTS "Allow anonymous user operations" ON users;

DROP POLICY IF EXISTS "Users can read own friendships" ON friendships;
DROP POLICY IF EXISTS "Users can manage own friendship requests" ON friendships;
DROP POLICY IF EXISTS "Enable all operations for authenticated users on friendships" ON friendships;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on friendships" ON friendships;

DROP POLICY IF EXISTS "Users can read wall posts on accessible profiles" ON wall_posts;
DROP POLICY IF EXISTS "Users can create wall posts on accessible profiles" ON wall_posts;
DROP POLICY IF EXISTS "Users can update own wall posts" ON wall_posts;
DROP POLICY IF EXISTS "Users can delete own wall posts or posts on their wall" ON wall_posts;
DROP POLICY IF EXISTS "Enable all operations for authenticated users on wall_posts" ON wall_posts;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on wall_posts" ON wall_posts;

DROP POLICY IF EXISTS "Users can read own characters" ON characters;
DROP POLICY IF EXISTS "Users can manage own characters" ON characters;
DROP POLICY IF EXISTS "Enable all operations for authenticated users on characters" ON characters;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on characters" ON characters;
DROP POLICY IF EXISTS "Allow all operations on characters for authenticated" ON characters;
DROP POLICY IF EXISTS "Allow anonymous character operations" ON characters;

DROP POLICY IF EXISTS "Users can read all guilds" ON guilds;
DROP POLICY IF EXISTS "Users can create guilds" ON guilds;
DROP POLICY IF EXISTS "Guild leaders can update their guilds" ON guilds;
DROP POLICY IF EXISTS "Enable all operations for authenticated users on guilds" ON guilds;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on guilds" ON guilds;

DROP POLICY IF EXISTS "Users can read guild memberships" ON guild_memberships;
DROP POLICY IF EXISTS "Users can manage own guild memberships" ON guild_memberships;
DROP POLICY IF EXISTS "Enable all operations for authenticated users on guild_memberships" ON guild_memberships;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on guild_memberships" ON guild_memberships;

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid()::text);

CREATE POLICY "Users can read accessible profiles"
  ON users FOR SELECT TO authenticated
  USING ((settings->>'profilePrivate')::boolean IS NOT TRUE OR auth_user_id = auth.uid()::text);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid()::text)
  WITH CHECK (auth_user_id = auth.uid()::text);

CREATE POLICY "Users can delete own profile"
  ON users FOR DELETE TO authenticated
  USING (auth_user_id = auth.uid()::text);

CREATE POLICY "Users can read own friendships"
  ON friendships FOR SELECT TO authenticated
  USING (requester_id = auth.uid()::text OR addressee_id = auth.uid()::text);

CREATE POLICY "Users can manage own friendship requests"
  ON friendships FOR ALL TO authenticated
  USING (requester_id = auth.uid()::text OR addressee_id = auth.uid()::text)
  WITH CHECK (requester_id = auth.uid()::text OR addressee_id = auth.uid()::text);

CREATE POLICY "Users can read wall posts on accessible profiles"
  ON wall_posts FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()::text OR
    target_user_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = wall_posts.target_user_id
      AND (users.settings->>'profilePrivate')::boolean IS NOT TRUE
    )
  );

CREATE POLICY "Users can create wall posts on accessible profiles"
  ON wall_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = wall_posts.target_user_id
      AND (users.settings->>'allowWallPosts')::boolean IS TRUE
      AND ((users.settings->>'profilePrivate')::boolean IS NOT TRUE OR users.auth_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can update own wall posts"
  ON wall_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid()::text)
  WITH CHECK (author_id = auth.uid()::text);

CREATE POLICY "Users can delete own wall posts or posts on their wall"
  ON wall_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid()::text OR target_user_id = auth.uid()::text);

CREATE POLICY "Users can read own characters"
  ON characters FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can manage own characters"
  ON characters FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can read all guilds"
  ON guilds FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create guilds"
  ON guilds FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid()::text);

CREATE POLICY "Guild leaders can update their guilds"
  ON guilds FOR UPDATE TO authenticated
  USING (leader_id = auth.uid()::text)
  WITH CHECK (leader_id = auth.uid()::text);

CREATE POLICY "Guild leaders can delete their guilds"
  ON guilds FOR DELETE TO authenticated
  USING (leader_id = auth.uid()::text);

CREATE POLICY "Users can read guild memberships"
  ON guild_memberships FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can manage own guild memberships"
  ON guild_memberships FOR ALL TO authenticated
  USING (
    user_id = auth.uid()::text OR
    EXISTS (SELECT 1 FROM guilds WHERE guilds.id = guild_memberships.guild_id AND guilds.leader_id = auth.uid()::text)
  )
  WITH CHECK (
    user_id = auth.uid()::text OR
    EXISTS (SELECT 1 FROM guilds WHERE guilds.id = guild_memberships.guild_id AND guilds.leader_id = auth.uid()::text)
  );
