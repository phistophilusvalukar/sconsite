/* Ensure the public profile wrapper only returns the requested character. */

CREATE OR REPLACE FUNCTION public.get_public_character_profile(p_character_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE
    WHEN base.payload IS NULL THEN NULL
    ELSE jsonb_set(
      jsonb_set(
        jsonb_set(base.payload, '{character,character_status}', to_jsonb(character.character_status), true),
        '{relationships}', relationship_data.relationships, true
      ),
      '{relatedCharacterNames}', relationship_data.related_names, true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_lifecycle_status(character.id) AS payload
  ) base
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN character.character_status = 'dead'
        OR NOT COALESCE((character.profile_section_visibility->>'relationships')::boolean, true)
      THEN '[]'::jsonb
      ELSE COALESCE(jsonb_agg(jsonb_build_object(
        'id', relationship.id,
        'sourceCharacterId', relationship.source_character_id,
        'targetCharacterId', relationship.target_character_id,
        'name', relationship.relationship_name,
        'tag', relationship.relationship_tag,
        'sentiment', relationship.sentiment_value,
        'sourceApproved', true,
        'targetApproved', true,
        'confirmedAt', relationship.confirmed_at,
        'createdAt', relationship.created_at,
        'updatedAt', relationship.updated_at
      ) ORDER BY relationship.created_at), '[]'::jsonb) END AS relationships,
      CASE WHEN character.character_status = 'dead'
        OR NOT COALESCE((character.profile_section_visibility->>'relationships')::boolean, true)
      THEN '{}'::jsonb
      ELSE COALESCE(jsonb_object_agg(related.id::text, related.name)
        FILTER (WHERE related.id IS NOT NULL), '{}'::jsonb) END AS related_names
    FROM public.character_relationships relationship
    JOIN public.characters related ON related.id = CASE
      WHEN relationship.source_character_id = character.id THEN relationship.target_character_id
      ELSE relationship.source_character_id
    END
    WHERE character.id IN (relationship.source_character_id, relationship.target_character_id)
      AND relationship.confirmed_at IS NOT NULL
      AND relationship.source_approved = true
      AND relationship.target_approved = true
      AND related.profile_is_public = true
      AND related.character_status IN ('active', 'retired')
  ) relationship_data
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
