/*
  # Guild management

  - Guilds can be Active, Inactive, or Recruiting.
  - A guild leader must choose a character as leader.
  - A user can lead only one guild.
  - Active guilds require one leader plus three founding members.
  - Members can be Leader, Officer, Member, or Ally, with a custom role title.
  - Users can only be a Leader/Officer/Member of one active guild, but can be allies in many.
  - Users can apply to join guilds.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leader_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Recruiting',
  ADD COLUMN IF NOT EXISTS founding_required integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS founded_at timestamptz,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'Adventuring',
  ADD COLUMN IF NOT EXISTS region text DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo text,
  ADD COLUMN IF NOT EXISTS rank text DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS badges text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recent_activity text DEFAULT '';

UPDATE guilds
SET
  created_by = COALESCE(created_by, leader_id),
  status = CASE
    WHEN lower(COALESCE(recruitment_status, 'open')) = 'closed' THEN 'Inactive'
    ELSE COALESCE(status, 'Recruiting')
  END
WHERE created_by IS NULL
   OR status IS NULL;

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_status_check;

ALTER TABLE guilds
  ADD CONSTRAINT guilds_status_check CHECK (status IN ('Active', 'Inactive', 'Recruiting'));

ALTER TABLE guild_memberships
  ADD COLUMN IF NOT EXISTS character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role_category text DEFAULT 'Member',
  ADD COLUMN IF NOT EXISTS role_title text,
  ADD COLUMN IF NOT EXISTS membership_status text DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS invited_by text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS badges text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contributions integer DEFAULT 0;

UPDATE guild_memberships
SET
  role_category = CASE lower(COALESCE(role, 'member'))
    WHEN 'leader' THEN 'Leader'
    WHEN 'officer' THEN 'Officer'
    ELSE 'Member'
  END,
  membership_status = COALESCE(membership_status, 'Active'),
  accepted_at = COALESCE(accepted_at, joined_at)
WHERE role_category IS NULL
   OR membership_status IS NULL;

ALTER TABLE guild_memberships
  DROP CONSTRAINT IF EXISTS guild_memberships_role_category_check,
  DROP CONSTRAINT IF EXISTS guild_memberships_membership_status_check;

ALTER TABLE guild_memberships
  ADD CONSTRAINT guild_memberships_role_category_check CHECK (role_category IN ('Leader', 'Officer', 'Member', 'Ally')),
  ADD CONSTRAINT guild_memberships_membership_status_check CHECK (membership_status IN ('Invited', 'Applied', 'Active', 'Rejected'));

CREATE TABLE IF NOT EXISTS guild_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  requested_role_category text DEFAULT 'Member' CHECK (requested_role_category IN ('Officer', 'Member', 'Ally')),
  message text DEFAULT '',
  status text DEFAULT 'Pending' CHECK (status IN ('Pending', 'Accepted', 'Rejected', 'Withdrawn')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(guild_id, user_id, status)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guilds_one_leader_per_user
  ON guilds(leader_id)
  WHERE status <> 'Inactive';

CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_memberships_one_core_guild_per_user
  ON guild_memberships(user_id)
  WHERE role_category IN ('Leader', 'Officer', 'Member')
    AND membership_status = 'Active';

CREATE INDEX IF NOT EXISTS idx_guilds_status ON guilds(status);
CREATE INDEX IF NOT EXISTS idx_guilds_leader_character ON guilds(leader_character_id);
CREATE INDEX IF NOT EXISTS idx_guild_memberships_role_category ON guild_memberships(role_category);
CREATE INDEX IF NOT EXISTS idx_guild_memberships_membership_status ON guild_memberships(membership_status);
CREATE INDEX IF NOT EXISTS idx_guild_applications_guild ON guild_applications(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_guild_applications_user ON guild_applications(user_id, status);

ALTER TABLE guild_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read guild applications they own or lead" ON guild_applications;
DROP POLICY IF EXISTS "Users can create guild applications" ON guild_applications;
DROP POLICY IF EXISTS "Users can update guild applications they own or lead" ON guild_applications;

CREATE POLICY "Users can read guild applications they own or lead"
  ON guild_applications FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text OR
    EXISTS (SELECT 1 FROM guilds WHERE guilds.id = guild_applications.guild_id AND guilds.leader_id = auth.uid()::text)
  );

CREATE POLICY "Users can create guild applications"
  ON guild_applications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update guild applications they own or lead"
  ON guild_applications FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()::text OR
    EXISTS (SELECT 1 FROM guilds WHERE guilds.id = guild_applications.guild_id AND guilds.leader_id = auth.uid()::text)
  )
  WITH CHECK (
    user_id = auth.uid()::text OR
    EXISTS (SELECT 1 FROM guilds WHERE guilds.id = guild_applications.guild_id AND guilds.leader_id = auth.uid()::text)
  );
