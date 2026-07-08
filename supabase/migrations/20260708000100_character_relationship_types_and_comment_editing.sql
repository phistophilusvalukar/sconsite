/*
  # Relationship types and comment editing

  - Relationship label becomes optional subtype metadata.
  - Relationships can carry multiple typed relationship values.
  - Journal comment authors can edit/delete their comments.
  - Character owners can delete comments on their character journal entries.
*/

ALTER TABLE character_relationships
  ADD COLUMN IF NOT EXISTS relationship_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subtype text;

UPDATE character_relationships
SET
  subtype = COALESCE(subtype, label),
  relationship_types = CASE
    WHEN relationship_types = '{}'::text[] THEN ARRAY['family']::text[]
    ELSE relationship_types
  END
WHERE subtype IS NULL
   OR relationship_types = '{}'::text[];

ALTER TABLE character_relationships
  ALTER COLUMN label DROP NOT NULL;

ALTER TABLE character_relationships
  DROP CONSTRAINT IF EXISTS character_relationships_relationship_types_check;

ALTER TABLE character_relationships
  ADD CONSTRAINT character_relationships_relationship_types_check
  CHECK (
    relationship_types <@ ARRAY[
      'family',
      'rival',
      'romantic',
      'patron',
      'owes_debt',
      'guildmate',
      'ally'
    ]::text[]
  );

DROP POLICY IF EXISTS "Users manage own journal comments" ON character_journal_comments;
DROP POLICY IF EXISTS "Users remove own journal comments" ON character_journal_comments;
DROP POLICY IF EXISTS "Users or character owners remove journal comments" ON character_journal_comments;

CREATE POLICY "Comment authors can edit journal comments"
  ON character_journal_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()::text)
  WITH CHECK (author_id = auth.uid()::text);

CREATE POLICY "Users or character owners remove journal comments"
  ON character_journal_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()::text OR
    EXISTS (
      SELECT 1
      FROM character_journal_entries entry
      JOIN characters character ON character.id = entry.character_id
      WHERE entry.id = character_journal_comments.entry_id
        AND character.user_id = auth.uid()::text
    )
  );
