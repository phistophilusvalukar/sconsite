/*
  # Character social tables

  - Foundry files move out of character stats and stay owner-only.
  - Journal entries are public for active characters and support comments and likes.
  - Relationships are first-class edges between characters and are public for active source characters.
*/

CREATE TABLE IF NOT EXISTS character_foundry_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  name text NOT NULL,
  json_data jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_journal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES character_journal_entries(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_journal_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES character_journal_entries(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entry_id, user_id)
);

CREATE TABLE IF NOT EXISTS character_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  target_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_character_id, target_character_id)
);

CREATE INDEX IF NOT EXISTS idx_character_foundry_files_character ON character_foundry_files(character_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_character_journal_entries_character ON character_journal_entries(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_character_journal_comments_entry ON character_journal_comments(entry_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_character_journal_likes_entry ON character_journal_likes(entry_id);
CREATE INDEX IF NOT EXISTS idx_character_relationships_source ON character_relationships(source_character_id);
CREATE INDEX IF NOT EXISTS idx_character_relationships_target ON character_relationships(target_character_id);

ALTER TABLE character_foundry_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_journal_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_journal_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Character owners manage Foundry files" ON character_foundry_files;
DROP POLICY IF EXISTS "Character owners read Foundry files" ON character_foundry_files;
DROP POLICY IF EXISTS "Readable journal entries for public characters" ON character_journal_entries;
DROP POLICY IF EXISTS "Character owners manage journal entries" ON character_journal_entries;
DROP POLICY IF EXISTS "Readable journal comments for public characters" ON character_journal_comments;
DROP POLICY IF EXISTS "Authenticated users comment on readable journals" ON character_journal_comments;
DROP POLICY IF EXISTS "Users manage own journal comments" ON character_journal_comments;
DROP POLICY IF EXISTS "Readable journal likes for public characters" ON character_journal_likes;
DROP POLICY IF EXISTS "Authenticated users like readable journals" ON character_journal_likes;
DROP POLICY IF EXISTS "Users remove own journal likes" ON character_journal_likes;
DROP POLICY IF EXISTS "Readable relationships for public characters" ON character_relationships;
DROP POLICY IF EXISTS "Character owners manage relationships" ON character_relationships;

CREATE POLICY "Character owners read Foundry files"
  ON character_foundry_files FOR SELECT TO authenticated
  USING (owner_id = auth.uid()::text);

CREATE POLICY "Character owners manage Foundry files"
  ON character_foundry_files FOR ALL TO authenticated
  USING (owner_id = auth.uid()::text)
  WITH CHECK (
    owner_id = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_foundry_files.character_id
        AND characters.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Readable journal entries for public characters"
  ON character_journal_entries FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_journal_entries.character_id
        AND (characters.is_active = true OR characters.user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Character owners manage journal entries"
  ON character_journal_entries FOR ALL TO authenticated
  USING (author_id = auth.uid()::text)
  WITH CHECK (
    author_id = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_journal_entries.character_id
        AND characters.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Readable journal comments for public characters"
  ON character_journal_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM character_journal_entries entry
      JOIN characters character ON character.id = entry.character_id
      WHERE entry.id = character_journal_comments.entry_id
        AND (character.is_active = true OR character.user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Authenticated users comment on readable journals"
  ON character_journal_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()::text AND
    EXISTS (
      SELECT 1
      FROM character_journal_entries entry
      JOIN characters character ON character.id = entry.character_id
      WHERE entry.id = character_journal_comments.entry_id
        AND (character.is_active = true OR character.user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users manage own journal comments"
  ON character_journal_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()::text)
  WITH CHECK (author_id = auth.uid()::text);

CREATE POLICY "Users remove own journal comments"
  ON character_journal_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid()::text);

CREATE POLICY "Readable journal likes for public characters"
  ON character_journal_likes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM character_journal_entries entry
      JOIN characters character ON character.id = entry.character_id
      WHERE entry.id = character_journal_likes.entry_id
        AND (character.is_active = true OR character.user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Authenticated users like readable journals"
  ON character_journal_likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text AND
    EXISTS (
      SELECT 1
      FROM character_journal_entries entry
      JOIN characters character ON character.id = entry.character_id
      WHERE entry.id = character_journal_likes.entry_id
        AND (character.is_active = true OR character.user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users remove own journal likes"
  ON character_journal_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "Readable relationships for public characters"
  ON character_relationships FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_relationships.source_character_id
        AND (characters.is_active = true OR characters.user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Character owners manage relationships"
  ON character_relationships FOR ALL TO authenticated
  USING (owner_id = auth.uid()::text)
  WITH CHECK (
    owner_id = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_relationships.source_character_id
        AND characters.user_id = auth.uid()::text
    )
  );

INSERT INTO character_foundry_files (character_id, owner_id, name, json_data, sort_order, created_at, updated_at)
SELECT id, user_id, COALESCE(foundry_file_name, name || '.json'), foundry_json, 0, created_at, updated_at
FROM characters
WHERE foundry_json IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM character_foundry_files
    WHERE character_foundry_files.character_id = characters.id
  );

INSERT INTO character_journal_entries (id, character_id, author_id, title, body, created_at, updated_at)
SELECT
  (entry->>'id')::uuid,
  characters.id,
  characters.user_id,
  COALESCE(NULLIF(entry->>'title', ''), 'Journal Entry'),
  COALESCE(entry->>'body', ''),
  COALESCE((entry->>'createdAt')::timestamptz, characters.created_at),
  COALESCE((entry->>'createdAt')::timestamptz, characters.updated_at)
FROM characters
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(characters.stats->'journalEntries', '[]'::jsonb)) AS entry
WHERE entry ? 'id'
  AND entry->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND entry->>'body' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM character_journal_entries
    WHERE character_journal_entries.id = (entry->>'id')::uuid
  );

INSERT INTO character_relationships (id, source_character_id, target_character_id, owner_id, label, created_at, updated_at)
SELECT
  (relationship->>'id')::uuid,
  characters.id,
  (relationship->>'targetCharacterId')::uuid,
  characters.user_id,
  COALESCE(NULLIF(relationship->>'label', ''), 'Connected'),
  COALESCE((relationship->>'createdAt')::timestamptz, characters.created_at),
  COALESCE((relationship->>'updatedAt')::timestamptz, characters.updated_at)
FROM characters
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(characters.stats->'relationships', '[]'::jsonb)) AS relationship
WHERE relationship ? 'id'
  AND relationship ? 'targetCharacterId'
  AND relationship->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND relationship->>'targetCharacterId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM characters target
    WHERE target.id = (relationship->>'targetCharacterId')::uuid
  )
  AND NOT EXISTS (
    SELECT 1 FROM character_relationships
    WHERE character_relationships.id = (relationship->>'id')::uuid
  );
