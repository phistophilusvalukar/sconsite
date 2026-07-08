/*
  # Character main role

  - Add a single primary party role for character cards and game roster highlighting.
*/

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS main_role text
  CHECK (main_role IS NULL OR main_role IN ('Healer', 'Tank', 'DPS', 'Support'));

CREATE INDEX IF NOT EXISTS idx_characters_main_role ON characters(main_role);
