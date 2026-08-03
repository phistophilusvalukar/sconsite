ALTER TABLE site_pages
  DROP CONSTRAINT IF EXISTS site_pages_known_page_key;

ALTER TABLE site_pages
  ADD CONSTRAINT site_pages_known_page_key CHECK (
    page_key IN (
      'home',
      'about',
      'characters',
      'citizens',
      'guilds',
      'schedule',
      'games',
      'arcana',
      'underhaul-contracts',
      'arcane-locks',
      'broken-seals',
      'campaign-objectives',
      'event',
      'skill-checks',
      'news'
    )
  );

INSERT INTO site_pages (page_key, is_enabled)
VALUES ('campaign-objectives', true)
ON CONFLICT (page_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_by text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES campaign_objectives(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'unstarted', 'partial', 'complete')),
  kind text NOT NULL CHECK (kind IN ('main', 'sub', 'special')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_objective_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES campaign_objectives(id) ON DELETE CASCADE,
  author_id text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES campaign_parties(id) ON DELETE CASCADE,
  user_id text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  character_name text NOT NULL DEFAULT '',
  profile_href text NOT NULL DEFAULT '',
  art_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES campaign_parties(id) ON DELETE CASCADE,
  run_number integer NOT NULL,
  title text NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  member_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(party_id, run_number)
);

CREATE TABLE IF NOT EXISTS campaign_run_objectives (
  run_id uuid NOT NULL REFERENCES campaign_runs(id) ON DELETE CASCADE,
  objective_id uuid NOT NULL REFERENCES campaign_objectives(id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, objective_id)
);

CREATE TABLE IF NOT EXISTS campaign_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES campaign_runs(id) ON DELETE CASCADE,
  objective_id uuid NOT NULL REFERENCES campaign_objectives(id) ON DELETE CASCADE,
  objective_title text NOT NULL,
  objective_kind text NOT NULL CHECK (objective_kind IN ('main', 'sub', 'special')),
  status text NOT NULL CHECK (status IN ('unstarted', 'partial', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_run_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES campaign_runs(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  character_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES campaign_parties(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES campaign_runs(id) ON DELETE CASCADE,
  author_id text REFERENCES users(auth_user_id) ON DELETE SET NULL,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  achievement_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_objectives_campaign ON campaign_objectives(campaign_id, kind, sort_order);
CREATE INDEX IF NOT EXISTS idx_campaign_comments_objective ON campaign_objective_comments(objective_id, created_at);
CREATE INDEX IF NOT EXISTS idx_campaign_parties_campaign ON campaign_parties(campaign_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_campaign_members_party ON campaign_party_members(party_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_campaign_runs_campaign_party ON campaign_runs(campaign_id, party_id, run_number);
CREATE INDEX IF NOT EXISTS idx_campaign_journals_campaign ON campaign_journal_entries(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_run_comments_run ON campaign_run_comments(run_id, created_at);

INSERT INTO campaigns (name, slug, summary, status)
VALUES ('New Orra Saga', 'new-orra-saga', '', 'active')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_objective_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_party_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_run_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_run_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read campaigns" ON campaigns;
DROP POLICY IF EXISTS "Admins can manage campaigns" ON campaigns;
DROP POLICY IF EXISTS "Anyone can read campaign objectives" ON campaign_objectives;
DROP POLICY IF EXISTS "Admins can manage campaign objectives" ON campaign_objectives;
DROP POLICY IF EXISTS "Anyone can read campaign objective comments" ON campaign_objective_comments;
DROP POLICY IF EXISTS "Authenticated users can add campaign objective comments" ON campaign_objective_comments;
DROP POLICY IF EXISTS "Comment authors and admins can update campaign objective comments" ON campaign_objective_comments;
DROP POLICY IF EXISTS "Comment authors and admins can delete campaign objective comments" ON campaign_objective_comments;
DROP POLICY IF EXISTS "Anyone can read campaign parties" ON campaign_parties;
DROP POLICY IF EXISTS "Admins can manage campaign parties" ON campaign_parties;
DROP POLICY IF EXISTS "Anyone can read campaign party members" ON campaign_party_members;
DROP POLICY IF EXISTS "Admins can manage campaign party members" ON campaign_party_members;
DROP POLICY IF EXISTS "Anyone can read campaign runs" ON campaign_runs;
DROP POLICY IF EXISTS "Admins can manage campaign runs" ON campaign_runs;
DROP POLICY IF EXISTS "Anyone can read campaign run objectives" ON campaign_run_objectives;
DROP POLICY IF EXISTS "Admins can manage campaign run objectives" ON campaign_run_objectives;
DROP POLICY IF EXISTS "Anyone can read campaign achievements" ON campaign_achievements;
DROP POLICY IF EXISTS "Admins can manage campaign achievements" ON campaign_achievements;
DROP POLICY IF EXISTS "Anyone can read campaign run comments" ON campaign_run_comments;
DROP POLICY IF EXISTS "Authenticated users can create campaign run comments" ON campaign_run_comments;
DROP POLICY IF EXISTS "Run comment authors and admins can update campaign run comments" ON campaign_run_comments;
DROP POLICY IF EXISTS "Run comment authors and admins can delete campaign run comments" ON campaign_run_comments;
DROP POLICY IF EXISTS "Anyone can read campaign journal entries" ON campaign_journal_entries;
DROP POLICY IF EXISTS "Authenticated users can create campaign journal entries" ON campaign_journal_entries;
DROP POLICY IF EXISTS "Journal authors and admins can update campaign journal entries" ON campaign_journal_entries;
DROP POLICY IF EXISTS "Journal authors and admins can delete campaign journal entries" ON campaign_journal_entries;

CREATE POLICY "Anyone can read campaigns" ON campaigns FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage campaigns" ON campaigns FOR ALL TO authenticated USING (public.is_site_admin(auth.uid()::text)) WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign objectives" ON campaign_objectives FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage campaign objectives" ON campaign_objectives FOR ALL TO authenticated USING (public.is_site_admin(auth.uid()::text)) WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign objective comments" ON campaign_objective_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated users can add campaign objective comments" ON campaign_objective_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid()::text);
CREATE POLICY "Comment authors and admins can update campaign objective comments" ON campaign_objective_comments FOR UPDATE TO authenticated USING (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text)) WITH CHECK (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text));
CREATE POLICY "Comment authors and admins can delete campaign objective comments" ON campaign_objective_comments FOR DELETE TO authenticated USING (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign parties" ON campaign_parties FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage campaign parties" ON campaign_parties FOR ALL TO authenticated USING (public.is_site_admin(auth.uid()::text)) WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign party members" ON campaign_party_members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage campaign party members" ON campaign_party_members FOR ALL TO authenticated USING (public.is_site_admin(auth.uid()::text)) WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign runs" ON campaign_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage campaign runs" ON campaign_runs FOR ALL TO authenticated USING (public.is_site_admin(auth.uid()::text)) WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign run objectives" ON campaign_run_objectives FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage campaign run objectives" ON campaign_run_objectives FOR ALL TO authenticated USING (public.is_site_admin(auth.uid()::text)) WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign achievements" ON campaign_achievements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage campaign achievements" ON campaign_achievements FOR ALL TO authenticated USING (public.is_site_admin(auth.uid()::text)) WITH CHECK (public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign run comments" ON campaign_run_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated users can create campaign run comments" ON campaign_run_comments FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM characters
    WHERE characters.id = campaign_run_comments.character_id
      AND characters.user_id = auth.uid()::text
  )
);
CREATE POLICY "Run comment authors and admins can update campaign run comments" ON campaign_run_comments FOR UPDATE TO authenticated USING (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text)) WITH CHECK (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text));
CREATE POLICY "Run comment authors and admins can delete campaign run comments" ON campaign_run_comments FOR DELETE TO authenticated USING (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text));

CREATE POLICY "Anyone can read campaign journal entries" ON campaign_journal_entries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated users can create campaign journal entries" ON campaign_journal_entries FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM characters
    WHERE characters.id = campaign_journal_entries.character_id
      AND characters.user_id = auth.uid()::text
  )
  AND EXISTS (
    SELECT 1
    FROM campaign_runs
    JOIN campaign_party_members
      ON campaign_party_members.id = ANY(campaign_runs.member_ids)
    JOIN characters
      ON characters.id = campaign_journal_entries.character_id
    WHERE campaign_runs.id = campaign_journal_entries.run_id
      AND (
        campaign_party_members.character_id = campaign_journal_entries.character_id
        OR campaign_party_members.character_name = characters.name
      )
  )
);
CREATE POLICY "Journal authors and admins can update campaign journal entries" ON campaign_journal_entries FOR UPDATE TO authenticated USING (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text)) WITH CHECK (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text));
CREATE POLICY "Journal authors and admins can delete campaign journal entries" ON campaign_journal_entries FOR DELETE TO authenticated USING (author_id = auth.uid()::text OR public.is_site_admin(auth.uid()::text));
