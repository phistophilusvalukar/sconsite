/*
  # Character-based guild roster

  - Guild founding requirement is three non-leader founding characters.
  - Active character summaries can be read by authenticated users so guild rosters,
    founder search, and applications can show character names instead of user IDs.
*/

ALTER TABLE guilds
  ALTER COLUMN founding_required SET DEFAULT 3;

UPDATE guilds
SET founding_required = 3
WHERE founding_required IS NULL
   OR founding_required = 4;

DROP POLICY IF EXISTS "Users can read active character summaries" ON characters;

CREATE POLICY "Users can read active character summaries"
  ON characters FOR SELECT TO authenticated
  USING (is_active = true OR user_id = auth.uid()::text);

UPDATE guilds
SET
  member_count = membership_counts.active_core_count,
  status = CASE
    WHEN membership_counts.active_core_count >= COALESCE(guilds.founding_required, 3) + 1 THEN 'Active'
    WHEN guilds.status <> 'Inactive' THEN 'Recruiting'
    ELSE guilds.status
  END,
  updated_at = now()
FROM (
  SELECT guild_id, count(*) AS active_core_count
  FROM guild_memberships
  WHERE membership_status = 'Active'
    AND role_category IN ('Leader', 'Officer', 'Member')
  GROUP BY guild_id
) AS membership_counts
WHERE guilds.id = membership_counts.guild_id;
