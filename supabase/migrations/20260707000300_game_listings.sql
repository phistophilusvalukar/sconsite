/*
  # Game listings

  Adds posted games, optional player invites, applications with candidate
  characters, and GM roster/on-deck decisions.
*/

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  gm_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  gm_name text NOT NULL,
  reward_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE RESTRICT,
  schedule_poll_id uuid REFERENCES schedule_polls(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 240,
  character_level integer NOT NULL,
  tier text NOT NULL,
  party_size integer NOT NULL DEFAULT 4,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed', 'Completed', 'Cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (duration_minutes >= 30),
  CHECK (character_level >= 1),
  CHECK (party_size >= 1)
);

CREATE TABLE IF NOT EXISTS game_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  display_name text NOT NULL,
  source text NOT NULL DEFAULT 'Manual' CHECK (source IN ('Manual', 'Poll')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(game_id, user_id)
);

CREATE TABLE IF NOT EXISTS game_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  display_name text NOT NULL,
  character_ids uuid[] NOT NULL DEFAULT '{}',
  locked_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Applied' CHECK (status IN ('Applied', 'Roster', 'On Deck', 'Declined', 'Withdrawn')),
  note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(game_id, user_id),
  CHECK (cardinality(character_ids) > 0)
);

CREATE INDEX IF NOT EXISTS idx_games_start_time ON games(start_time);
CREATE INDEX IF NOT EXISTS idx_games_status_start ON games(status, start_time);
CREATE INDEX IF NOT EXISTS idx_games_gm ON games(gm_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_games_tags ON games USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_game_invites_game ON game_invites(game_id);
CREATE INDEX IF NOT EXISTS idx_game_invites_user ON game_invites(user_id);
CREATE INDEX IF NOT EXISTS idx_game_applications_game ON game_applications(game_id, status);
CREATE INDEX IF NOT EXISTS idx_game_applications_user ON game_applications(user_id);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read games" ON games;
DROP POLICY IF EXISTS "GMs can create games" ON games;
DROP POLICY IF EXISTS "GMs can update their games" ON games;
DROP POLICY IF EXISTS "Users can read game invites" ON game_invites;
DROP POLICY IF EXISTS "GMs can create game invites" ON game_invites;
DROP POLICY IF EXISTS "GMs can delete game invites" ON game_invites;
DROP POLICY IF EXISTS "Users can read game applications" ON game_applications;
DROP POLICY IF EXISTS "Players can apply to games" ON game_applications;
DROP POLICY IF EXISTS "Players and GMs can update applications" ON game_applications;

CREATE POLICY "Users can read games"
  ON games FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "GMs can create games"
  ON games FOR INSERT TO authenticated
  WITH CHECK (gm_id = auth.uid()::text);

CREATE POLICY "GMs can update their games"
  ON games FOR UPDATE TO authenticated
  USING (gm_id = auth.uid()::text)
  WITH CHECK (gm_id = auth.uid()::text);

CREATE POLICY "Users can read game invites"
  ON game_invites FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "GMs can create game invites"
  ON game_invites FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM games
      WHERE games.id = game_invites.game_id
      AND games.gm_id = auth.uid()::text
    )
  );

CREATE POLICY "GMs can delete game invites"
  ON game_invites FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM games
      WHERE games.id = game_invites.game_id
      AND games.gm_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can read game applications"
  ON game_applications FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM games
      WHERE games.id = game_applications.game_id
      AND games.gm_id = auth.uid()::text
    )
  );

CREATE POLICY "Players can apply to games"
  ON game_applications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Players and GMs can update applications"
  ON game_applications FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM games
      WHERE games.id = game_applications.game_id
      AND games.gm_id = auth.uid()::text
    )
  )
  WITH CHECK (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM games
      WHERE games.id = game_applications.game_id
      AND games.gm_id = auth.uid()::text
    )
  );
