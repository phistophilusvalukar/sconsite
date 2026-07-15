/*
  # Performance melody challenges

  Adds optional persistence for performance melody challenge definitions and
  completed attempts. The React game works with a local config if these tables
  are unavailable, but authenticated users can record their own attempts when
  migrations have been applied.
*/

CREATE TABLE IF NOT EXISTS performance_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  display_mode text NOT NULL CHECK (display_mode IN ('guided', 'memory', 'ear')),
  sequence text[] NOT NULL,
  allowed_replays integer NOT NULL DEFAULT 1,
  allowed_attempts integer NOT NULL DEFAULT 1,
  note_duration_ms integer NOT NULL DEFAULT 400,
  note_gap_ms integer NOT NULL DEFAULT 150,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS performance_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid REFERENCES performance_challenges(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  submitted_sequence text[] NOT NULL,
  display_mode text NOT NULL CHECK (display_mode IN ('guided', 'memory', 'ear')),
  success boolean NOT NULL,
  replay_count integer NOT NULL DEFAULT 0,
  attempt_number integer NOT NULL DEFAULT 1,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_challenges_created_by ON performance_challenges(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_attempts_user ON performance_attempts(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_attempts_challenge ON performance_attempts(challenge_id, completed_at DESC);

ALTER TABLE performance_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read performance challenges" ON performance_challenges;
DROP POLICY IF EXISTS "Users can create their own performance challenges" ON performance_challenges;
DROP POLICY IF EXISTS "Users can update their own performance challenges" ON performance_challenges;
DROP POLICY IF EXISTS "Users can delete their own performance challenges" ON performance_challenges;

CREATE POLICY "Authenticated users can read performance challenges"
  ON performance_challenges FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create their own performance challenges"
  ON performance_challenges FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own performance challenges"
  ON performance_challenges FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their own performance challenges"
  ON performance_challenges FOR DELETE TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can create their own performance attempts" ON performance_attempts;
DROP POLICY IF EXISTS "Users can read their own performance attempts" ON performance_attempts;

CREATE POLICY "Users can create their own performance attempts"
  ON performance_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read their own performance attempts"
  ON performance_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
