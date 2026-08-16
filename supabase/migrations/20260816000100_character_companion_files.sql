/* Distinguish companion actor exports from primary character Foundry files. */

ALTER TABLE public.character_foundry_files
  ADD COLUMN IF NOT EXISTS subject_type text NOT NULL DEFAULT 'character';

ALTER TABLE public.character_foundry_files
  DROP CONSTRAINT IF EXISTS character_foundry_files_subject_type_check,
  ADD CONSTRAINT character_foundry_files_subject_type_check
    CHECK (subject_type IN ('character', 'familiar', 'animal_companion'));

CREATE INDEX IF NOT EXISTS idx_character_foundry_files_subject
  ON public.character_foundry_files(character_id, subject_type, sort_order);

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_companions;

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
    ELSE jsonb_set(
      public_profile.payload,
      '{companions}',
      COALESCE(companions.items, '[]'::jsonb),
      true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_companions(character.id) AS payload
  ) public_profile
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', file.id,
        'companionType', file.subject_type,
        'name', COALESCE(NULLIF(file.json_data->>'name', ''), file.name),
        'imageUrl', NULLIF(file.json_data->>'img', ''),
        'creatureType', NULLIF(file.json_data#>>'{system,details,creature,value}', ''),
        'level', NULLIF(file.json_data#>>'{system,details,level,value}', ''),
        'hpValue', NULLIF(file.json_data#>>'{system,attributes,hp,value}', ''),
        'hpMax', NULLIF(file.json_data#>>'{system,attributes,hp,max}', '')
      ) ORDER BY file.sort_order, file.created_at
    ) AS items
    FROM public.character_foundry_files file
    WHERE file.character_id = character.id
      AND file.subject_type IN ('familiar', 'animal_companion')
  ) companions
  WHERE character.id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
