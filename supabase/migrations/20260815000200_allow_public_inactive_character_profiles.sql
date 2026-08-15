/*
  # Decouple published profiles from active roster status

  profile_is_public is the explicit owner-controlled publication flag. A
  character being inactive in the playable roster should not make an otherwise
  published profile URL return "not public".

  Rebuild the already-deployed function from its catalog definition after
  removing only the top-level active-character predicate. The assertion keeps
  this migration from silently changing an unexpected function definition.
*/

DO $$
DECLARE
  v_definition text;
  v_active_predicate constant text := E'    AND c.profile_is_public = true\n    AND c.is_active = true;';
  v_public_predicate constant text := E'    AND c.profile_is_public = true;';
  v_oversized_object_boundary constant text := E'    \'guild_id\', NULL,\n    \'profile_subtitle\', v_character.profile_subtitle,';
  v_split_object_boundary constant text := E'    \'guild_id\', NULL\n  ) || jsonb_build_object(\n    \'profile_subtitle\', v_character.profile_subtitle,';
BEGIN
  SELECT pg_get_functiondef('public.get_public_character_profile(uuid)'::regprocedure)
  INTO v_definition;

  IF position(v_active_predicate IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected get_public_character_profile definition; active predicate was not found';
  END IF;
  IF position(v_oversized_object_boundary IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected get_public_character_profile definition; JSON object boundary was not found';
  END IF;

  v_definition := replace(v_definition, v_active_predicate, v_public_predicate);
  -- PostgreSQL accepts at most 100 function arguments. Split the existing
  -- presentation allowlist across two objects before recompiling the function.
  v_definition := replace(v_definition, v_oversized_object_boundary, v_split_object_boundary);
  EXECUTE v_definition;
END;
$$;

DROP INDEX IF EXISTS public.idx_characters_public_profiles;
CREATE INDEX idx_characters_public_profiles
  ON public.characters (id)
  WHERE profile_is_public = true;
