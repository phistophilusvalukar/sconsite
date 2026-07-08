/*
  # Character role badges and active Foundry file

  - Let players tag characters with grouped role badges for browsing.
  - Mark one Foundry JSON as the active power source for character details.
*/

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS role_badges text[] NOT NULL DEFAULT '{}';

ALTER TABLE character_foundry_files
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_characters_role_badges ON characters USING gin(role_badges);
CREATE INDEX IF NOT EXISTS idx_character_foundry_files_active ON character_foundry_files(character_id, is_active);

WITH ranked_active AS (
  SELECT id, row_number() OVER (PARTITION BY character_id ORDER BY sort_order ASC, created_at ASC) AS active_rank
  FROM character_foundry_files
  WHERE is_active = true
)
UPDATE character_foundry_files file
SET is_active = false
FROM ranked_active
WHERE file.id = ranked_active.id
  AND ranked_active.active_rank > 1;

UPDATE character_foundry_files first_file
SET is_active = true
WHERE first_file.id IN (
  SELECT DISTINCT ON (character_id) id
  FROM character_foundry_files
  WHERE is_active = false
  ORDER BY character_id, sort_order ASC, created_at ASC
)
AND NOT EXISTS (
  SELECT 1
  FROM character_foundry_files active_file
  WHERE active_file.character_id = first_file.character_id
    AND active_file.is_active = true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_character_foundry_files_one_active
  ON character_foundry_files(character_id)
  WHERE is_active = true;
