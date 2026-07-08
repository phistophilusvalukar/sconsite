/*
  # Game ticket archive and rewards

  - Track edited game times and completion rewards bonus.
  - Keep cancelled/completed games available for archive interaction.
  - Add archive comments and likes.
*/

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS original_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS rewards_bonus integer NOT NULL DEFAULT 0 CHECK (rewards_bonus IN (0, 5, 10, 15, 20)),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE games
SET original_start_time = start_time
WHERE original_start_time IS NULL;

CREATE TABLE IF NOT EXISTS game_archive_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_archive_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_games_archive_status ON games(status, start_time);
CREATE INDEX IF NOT EXISTS idx_game_archive_comments_game ON game_archive_comments(game_id, created_at);
CREATE INDEX IF NOT EXISTS idx_game_archive_likes_game ON game_archive_likes(game_id);

ALTER TABLE game_archive_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_archive_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read archive comments" ON game_archive_comments;
DROP POLICY IF EXISTS "Users can add archive comments" ON game_archive_comments;
DROP POLICY IF EXISTS "Users can edit own archive comments" ON game_archive_comments;
DROP POLICY IF EXISTS "Users can delete own archive comments" ON game_archive_comments;
DROP POLICY IF EXISTS "Users can read archive likes" ON game_archive_likes;
DROP POLICY IF EXISTS "Users can like archived games" ON game_archive_likes;
DROP POLICY IF EXISTS "Users can unlike archived games" ON game_archive_likes;

CREATE POLICY "Users can read archive comments"
  ON game_archive_comments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can add archive comments"
  ON game_archive_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()::text);

CREATE POLICY "Users can edit own archive comments"
  ON game_archive_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()::text)
  WITH CHECK (author_id = auth.uid()::text);

CREATE POLICY "Users can delete own archive comments"
  ON game_archive_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid()::text);

CREATE POLICY "Users can read archive likes"
  ON game_archive_likes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can like archived games"
  ON game_archive_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can unlike archived games"
  ON game_archive_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);
