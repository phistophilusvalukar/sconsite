/* Per-source-file level planning. Only character owners can read or update these rows via existing RLS. */
ALTER TABLE character_foundry_files
  ADD COLUMN IF NOT EXISTS planner_data jsonb;

ALTER TABLE character_foundry_files
  DROP CONSTRAINT IF EXISTS character_foundry_files_planner_data_shape;

ALTER TABLE character_foundry_files
  ADD CONSTRAINT character_foundry_files_planner_data_shape CHECK (
    planner_data IS NULL OR (
      jsonb_typeof(planner_data) = 'object'
      AND planner_data->>'version' = '1'
      AND jsonb_typeof(planner_data->'featLevels') = 'object'
      AND jsonb_typeof(planner_data->'skillUpgrades') = 'array'
    )
  );
