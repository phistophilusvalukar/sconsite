/*
  # Scheduling polls

  Adds When2meet-style availability polls for game scheduling.
  Poll owners create a date/time window in one timezone, participants answer in
  their own timezone, and organizers can select a winning slot for later game
  listing creation.
*/

CREATE TABLE IF NOT EXISTS schedule_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  creator_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  date_start date NOT NULL,
  date_end date NOT NULL,
  start_minutes integer NOT NULL,
  end_minutes integer NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
  selected_slot_key text,
  selected_slot_start timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (date_end >= date_start),
  CHECK (start_minutes >= 0 AND start_minutes < 1440),
  CHECK (end_minutes > 0 AND end_minutes <= 1440),
  CHECK (slot_minutes IN (15, 30, 60))
);

CREATE TABLE IF NOT EXISTS schedule_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES schedule_polls(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  display_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS schedule_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES schedule_polls(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES schedule_participants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  slot_start timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, participant_id, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_schedule_polls_creator ON schedule_polls(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_polls_status ON schedule_polls(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_participants_poll ON schedule_participants(poll_id);
CREATE INDEX IF NOT EXISTS idx_schedule_availability_poll ON schedule_availability(poll_id, slot_key);
CREATE INDEX IF NOT EXISTS idx_schedule_availability_user ON schedule_availability(user_id);

ALTER TABLE schedule_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read schedule polls" ON schedule_polls;
DROP POLICY IF EXISTS "Users can create schedule polls" ON schedule_polls;
DROP POLICY IF EXISTS "Poll creators can update schedule polls" ON schedule_polls;
DROP POLICY IF EXISTS "Users can read schedule participants" ON schedule_participants;
DROP POLICY IF EXISTS "Users can upsert their schedule participation" ON schedule_participants;
DROP POLICY IF EXISTS "Users can update their schedule participation" ON schedule_participants;
DROP POLICY IF EXISTS "Users can read schedule availability" ON schedule_availability;
DROP POLICY IF EXISTS "Users can create their schedule availability" ON schedule_availability;
DROP POLICY IF EXISTS "Users can delete their schedule availability" ON schedule_availability;

CREATE POLICY "Users can read schedule polls"
  ON schedule_polls FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create schedule polls"
  ON schedule_polls FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid()::text);

CREATE POLICY "Poll creators can update schedule polls"
  ON schedule_polls FOR UPDATE TO authenticated
  USING (creator_id = auth.uid()::text)
  WITH CHECK (creator_id = auth.uid()::text);

CREATE POLICY "Users can read schedule participants"
  ON schedule_participants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can upsert their schedule participation"
  ON schedule_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update their schedule participation"
  ON schedule_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can read schedule availability"
  ON schedule_availability FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create their schedule availability"
  ON schedule_availability FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can delete their schedule availability"
  ON schedule_availability FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);
