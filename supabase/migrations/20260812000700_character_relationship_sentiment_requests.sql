/*
  # Consent-based character relationships

  Replaces fixed relationship types and automatic guild connections with a
  named sentiment spectrum. A relationship is private while pending and is
  publicly readable only after both character owners approve it.
*/

DELETE FROM character_relationships
WHERE relationship_types @> ARRAY['guildmate']::text[];

ALTER TABLE character_relationships
  ADD COLUMN IF NOT EXISTS relationship_name text,
  ADD COLUMN IF NOT EXISTS relationship_tag text,
  ADD COLUMN IF NOT EXISTS sentiment_value smallint,
  ADD COLUMN IF NOT EXISTS source_approved boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS target_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

UPDATE character_relationships
SET
  relationship_name = COALESCE(NULLIF(btrim(subtype), ''), NULLIF(btrim(label), ''), 'Connection'),
  relationship_tag = CASE
    WHEN cardinality(relationship_types) > 0 THEN NULLIF(replace(relationship_types[1], '_', ' '), '')
    ELSE NULL
  END,
  sentiment_value = CASE
    WHEN relationship_types @> ARRAY['rival']::text[] THEN -70
    WHEN relationship_types @> ARRAY['owes_debt']::text[] THEN -25
    WHEN relationship_types @> ARRAY['romantic']::text[] THEN 80
    WHEN relationship_types @> ARRAY['ally']::text[] THEN 65
    WHEN relationship_types @> ARRAY['family']::text[] THEN 50
    WHEN relationship_types @> ARRAY['patron']::text[] THEN 25
    ELSE 0
  END,
  source_approved = true,
  target_approved = false,
  confirmed_at = NULL;

ALTER TABLE character_relationships
  ALTER COLUMN relationship_name SET NOT NULL,
  ALTER COLUMN sentiment_value SET NOT NULL,
  ALTER COLUMN sentiment_value SET DEFAULT 0,
  DROP CONSTRAINT IF EXISTS character_relationships_relationship_types_check,
  DROP CONSTRAINT IF EXISTS character_relationships_source_character_id_target_character_id_key,
  DROP COLUMN IF EXISTS relationship_types,
  DROP COLUMN IF EXISTS subtype,
  DROP COLUMN IF EXISTS label;

ALTER TABLE character_relationships
  DROP CONSTRAINT IF EXISTS character_relationships_distinct_characters_check,
  DROP CONSTRAINT IF EXISTS character_relationships_name_length_check,
  DROP CONSTRAINT IF EXISTS character_relationships_tag_length_check,
  DROP CONSTRAINT IF EXISTS character_relationships_sentiment_range_check,
  ADD CONSTRAINT character_relationships_distinct_characters_check
    CHECK (source_character_id <> target_character_id),
  ADD CONSTRAINT character_relationships_name_length_check
    CHECK (char_length(btrim(relationship_name)) BETWEEN 1 AND 80),
  ADD CONSTRAINT character_relationships_tag_length_check
    CHECK (relationship_tag IS NULL OR char_length(btrim(relationship_tag)) BETWEEN 1 AND 40),
  ADD CONSTRAINT character_relationships_sentiment_range_check
    CHECK (sentiment_value BETWEEN -100 AND 100);

-- The previous directed model allowed reciprocal rows. The new relationship
-- represents the pair itself, so retain the oldest request for each pair.
DELETE FROM character_relationships duplicate_relationship
USING character_relationships retained_relationship
WHERE (
    duplicate_relationship.created_at > retained_relationship.created_at
    OR (
      duplicate_relationship.created_at = retained_relationship.created_at
      AND duplicate_relationship.id > retained_relationship.id
    )
  )
  AND LEAST(duplicate_relationship.source_character_id, duplicate_relationship.target_character_id)
    = LEAST(retained_relationship.source_character_id, retained_relationship.target_character_id)
  AND GREATEST(duplicate_relationship.source_character_id, duplicate_relationship.target_character_id)
    = GREATEST(retained_relationship.source_character_id, retained_relationship.target_character_id);

CREATE UNIQUE INDEX IF NOT EXISTS character_relationships_unordered_pair_unique
  ON character_relationships (
    LEAST(source_character_id, target_character_id),
    GREATEST(source_character_id, target_character_id)
  );

CREATE INDEX IF NOT EXISTS idx_character_relationships_confirmed
  ON character_relationships (confirmed_at)
  WHERE confirmed_at IS NOT NULL;

DROP POLICY IF EXISTS "Readable relationships for public characters" ON character_relationships;
DROP POLICY IF EXISTS "Character owners manage relationships" ON character_relationships;
DROP POLICY IF EXISTS "Owners read pending and public reads confirmed relationships" ON character_relationships;

CREATE POLICY "Owners read pending and public reads confirmed relationships"
  ON character_relationships FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM characters
      WHERE characters.id IN (
        character_relationships.source_character_id,
        character_relationships.target_character_id
      )
        AND characters.user_id = auth.uid()::text
    )
    OR (
      character_relationships.confirmed_at IS NOT NULL
      AND character_relationships.source_approved = true
      AND character_relationships.target_approved = true
      AND EXISTS (
        SELECT 1 FROM characters source_character
        WHERE source_character.id = character_relationships.source_character_id
          AND source_character.is_active = true
      )
      AND EXISTS (
        SELECT 1 FROM characters target_character
        WHERE target_character.id = character_relationships.target_character_id
          AND target_character.is_active = true
      )
    )
  );

CREATE OR REPLACE FUNCTION request_character_relationship_command(
  p_source_character_id uuid,
  p_target_character_id uuid,
  p_name text,
  p_tag text DEFAULT NULL,
  p_sentiment integer DEFAULT 0
)
RETURNS character_relationships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_name text := btrim(COALESCE(p_name, ''));
  v_tag text := NULLIF(btrim(COALESCE(p_tag, '')), '');
  v_relationship character_relationships%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_source_character_id = p_target_character_id THEN
    RAISE EXCEPTION 'A character cannot have a relationship with themselves';
  END IF;

  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Relationship name must be between 1 and 80 characters';
  END IF;

  IF v_tag IS NOT NULL AND char_length(v_tag) > 40 THEN
    RAISE EXCEPTION 'Relationship tag must be 40 characters or fewer';
  END IF;

  IF p_sentiment IS NULL OR p_sentiment NOT BETWEEN -100 AND 100 THEN
    RAISE EXCEPTION 'Relationship sentiment must be between -100 and 100';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM characters
    WHERE id = p_source_character_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You do not own the requesting character';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM characters
    WHERE id = p_target_character_id
      AND (is_active = true OR user_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'The requested character is unavailable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM character_relationships
    WHERE LEAST(source_character_id, target_character_id) = LEAST(p_source_character_id, p_target_character_id)
      AND GREATEST(source_character_id, target_character_id) = GREATEST(p_source_character_id, p_target_character_id)
  ) THEN
    RAISE EXCEPTION 'These characters already have a relationship or pending request';
  END IF;

  INSERT INTO character_relationships (
    source_character_id,
    target_character_id,
    owner_id,
    relationship_name,
    relationship_tag,
    sentiment_value,
    source_approved,
    target_approved
  ) VALUES (
    p_source_character_id,
    p_target_character_id,
    v_user_id,
    v_name,
    v_tag,
    p_sentiment,
    true,
    false
  )
  RETURNING * INTO v_relationship;

  RETURN v_relationship;
END;
$$;

CREATE OR REPLACE FUNCTION respond_character_relationship_command(
  p_relationship_id uuid,
  p_character_id uuid,
  p_approve boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_relationship character_relationships%ROWTYPE;
  v_is_source boolean;
  v_is_target boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'An approval decision is required';
  END IF;

  SELECT * INTO v_relationship
  FROM character_relationships
  WHERE id = p_relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relationship request not found';
  END IF;

  v_is_source := v_relationship.source_character_id = p_character_id;
  v_is_target := v_relationship.target_character_id = p_character_id;

  IF NOT (v_is_source OR v_is_target) OR NOT EXISTS (
    SELECT 1 FROM characters
    WHERE id = p_character_id
      AND user_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'You cannot respond for this character';
  END IF;

  IF NOT p_approve THEN
    DELETE FROM character_relationships WHERE id = p_relationship_id;
    RETURN true;
  END IF;

  UPDATE character_relationships
  SET
    source_approved = source_approved OR v_is_source,
    target_approved = target_approved OR v_is_target,
    confirmed_at = CASE
      WHEN (source_approved OR v_is_source) AND (target_approved OR v_is_target)
        THEN COALESCE(confirmed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_relationship_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION delete_character_relationship_command(
  p_relationship_id uuid,
  p_character_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM character_relationships rel
    JOIN characters owned_character
      ON owned_character.id = p_character_id
     AND owned_character.user_id = auth.uid()::text
    WHERE rel.id = p_relationship_id
      AND p_character_id IN (rel.source_character_id, rel.target_character_id)
  ) THEN
    RAISE EXCEPTION 'You cannot remove this relationship';
  END IF;

  DELETE FROM character_relationships WHERE id = p_relationship_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION request_character_relationship_command(uuid, uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION respond_character_relationship_command(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_character_relationship_command(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_character_relationship_command(uuid, uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION respond_character_relationship_command(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_character_relationship_command(uuid, uuid) TO authenticated;
