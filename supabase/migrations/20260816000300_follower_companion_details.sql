/* Include the heritage and class needed to describe humanoid Follower companions. */

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_follower_details;

CREATE FUNCTION public.get_public_character_profile(p_character_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE
    WHEN public_profile.payload IS NULL THEN NULL
    ELSE jsonb_set(public_profile.payload, '{companions}', COALESCE(companions.items, '[]'::jsonb), true)
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_follower_details(character.id) AS payload
  ) public_profile
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', file.id,
        'companionType', file.subject_type,
        'name', COALESCE(NULLIF(file.json_data->>'name', ''), file.name),
        'imageUrl', NULLIF(file.json_data->>'img', ''),
        'creatureType', COALESCE(NULLIF(file.json_data#>>'{system,details,creature,value}', ''), actor_details.ancestry),
        'heritage', actor_details.heritage,
        'className', actor_details.class_name,
        'hpValue', NULLIF(file.json_data#>>'{system,attributes,hp,value}', ''),
        'hpMax', NULLIF(file.json_data#>>'{system,attributes,hp,max}', ''),
        'features', COALESCE(features.items, '[]'::jsonb)
      ) ORDER BY file.sort_order, file.created_at
    ) AS items
    FROM public.character_foundry_files file
    LEFT JOIN LATERAL (
      SELECT
        MAX(item->>'name') FILTER (WHERE item->>'type' = 'ancestry') AS ancestry,
        MAX(item->>'name') FILTER (WHERE item->>'type' = 'heritage') AS heritage,
        MAX(item->>'name') FILTER (WHERE item->>'type' = 'class') AS class_name
      FROM jsonb_array_elements(COALESCE(file.json_data->'items', '[]'::jsonb)) item
      WHERE item->>'type' IN ('ancestry', 'heritage', 'class')
    ) actor_details ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(feature.name ORDER BY feature.first_position) AS items
      FROM (
        SELECT item->>'name' AS name, MIN(position) AS first_position
        FROM jsonb_array_elements(COALESCE(file.json_data->'items', '[]'::jsonb)) WITH ORDINALITY source(item, position)
        WHERE NULLIF(item->>'name', '') IS NOT NULL
          AND (
            (file.subject_type = 'familiar' AND item->>'type' = 'action' AND item#>>'{system,category}' = 'familiar')
            OR (file.subject_type IN ('animal_companion', 'eidolon') AND item->>'type' IN ('feat', 'action'))
          )
        GROUP BY item->>'name'
        ORDER BY MIN(position)
        LIMIT 24
      ) feature
    ) features ON true
    WHERE file.character_id = character.id
      AND file.subject_type IN ('familiar', 'animal_companion', 'eidolon')
  ) companions
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
