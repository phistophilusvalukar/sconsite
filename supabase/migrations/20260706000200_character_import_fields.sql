/*
  # Add searchable Foundry character import fields

  - Store dual class values separately for search and statistics.
  - Replace race/alignment UI usage with ancestry and heritage fields.
  - Keep legacy class/race columns populated for older code and constraints.
  - Store the original Foundry JSON so users can download it later.
*/

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS class_primary text,
  ADD COLUMN IF NOT EXISTS class_secondary text,
  ADD COLUMN IF NOT EXISTS ancestry text,
  ADD COLUMN IF NOT EXISTS heritage text,
  ADD COLUMN IF NOT EXISTS foundry_json jsonb,
  ADD COLUMN IF NOT EXISTS foundry_file_name text;

UPDATE characters
SET
  class_primary = COALESCE(class_primary, class),
  ancestry = COALESCE(ancestry, race)
WHERE class_primary IS NULL
   OR ancestry IS NULL;

CREATE INDEX IF NOT EXISTS idx_characters_class_primary ON characters(class_primary);
CREATE INDEX IF NOT EXISTS idx_characters_class_secondary ON characters(class_secondary);
CREATE INDEX IF NOT EXISTS idx_characters_ancestry ON characters(ancestry);
CREATE INDEX IF NOT EXISTS idx_characters_heritage ON characters(heritage);
