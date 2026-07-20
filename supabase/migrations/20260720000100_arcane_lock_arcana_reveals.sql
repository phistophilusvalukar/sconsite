/* Per-player Arcana checks for inscriptions and glyph lore. */

CREATE TABLE arcane_lock_knowledge (
  lock_id uuid NOT NULL REFERENCES arcane_lock_instances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation bigint NOT NULL,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  character_name text,
  arcana_modifier integer,
  translation_attempted boolean NOT NULL DEFAULT false,
  translation_degree text CHECK (translation_degree IN ('critical_success', 'success', 'failure', 'critical_failure')),
  translation_text text,
  glyph_rolls_used integer NOT NULL DEFAULT 0 CHECK (glyph_rolls_used BETWEEN 0 AND 3),
  revealed_glyph_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lock_id, user_id, generation)
);

ALTER TABLE arcane_lock_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read their arcane knowledge" ON arcane_lock_knowledge
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.arcane_is_session_gm((SELECT session_id FROM arcane_lock_instances WHERE id = lock_id)));

CREATE OR REPLACE FUNCTION public.arcane_lock_dc(difficulty integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 14 + (GREATEST(1, difficulty) * 2) $$;

CREATE OR REPLACE FUNCTION public.arcane_character_modifier(character_row characters)
RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE raw_value text;
BEGIN
  raw_value := COALESCE(
    character_row.foundry_json #>> '{system,skills,arcana,mod}',
    character_row.foundry_json #>> '{system,skills,arcana,totalModifier}',
    character_row.stats #>> '{skills,arcana,mod}',
    character_row.stats #>> '{skills,arcana}',
    character_row.stats ->> 'arcana'
  );
  IF raw_value IS NULL OR raw_value !~ '^-?[0-9]+$' THEN RETURN 0; END IF;
  RETURN raw_value::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_arcane_lock_knowledge(target_lock_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lock_row arcane_lock_instances%ROWTYPE; template_row arcane_lock_templates%ROWTYPE; knowledge arcane_lock_knowledge%ROWTYPE;
BEGIN
  SELECT * INTO lock_row FROM arcane_lock_instances WHERE id = target_lock_id;
  IF lock_row.id IS NULL OR (NOT public.arcane_is_session_member(lock_row.session_id) AND NOT public.arcane_is_session_gm(lock_row.session_id)) THEN
    RAISE EXCEPTION 'Not a member of this arcane puzzle session';
  END IF;
  SELECT * INTO template_row FROM arcane_lock_templates WHERE id = lock_row.template_id;
  SELECT * INTO knowledge FROM arcane_lock_knowledge WHERE lock_id = lock_row.id AND user_id = auth.uid() AND generation = lock_row.generation;
  RETURN jsonb_build_object(
    'characterId', knowledge.character_id, 'characterName', knowledge.character_name,
    'arcanaModifier', knowledge.arcana_modifier, 'dc', public.arcane_lock_dc(template_row.difficulty),
    'translationAttempted', COALESCE(knowledge.translation_attempted, false), 'translationDegree', knowledge.translation_degree,
    'translationText', knowledge.translation_text, 'glyphRollsUsed', COALESCE(knowledge.glyph_rolls_used, 0),
    'glyphRollsRemaining', 3 - COALESCE(knowledge.glyph_rolls_used, 0),
    'revealedGlyphIds', COALESCE(to_jsonb(knowledge.revealed_glyph_ids), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.roll_arcane_lock_knowledge(target_lock_id uuid, target_character_id uuid, check_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lock_row arcane_lock_instances%ROWTYPE; template_row arcane_lock_templates%ROWTYPE; character_row characters%ROWTYPE;
  knowledge arcane_lock_knowledge%ROWTYPE; modifier integer; dc integer; die_roll integer; total integer; rank integer; degree text;
  reveal_count integer := 0; used_ids text[] := '{}'; all_ids text[] := '{}'; new_ids text[] := '{}'; candidate text;
  inscription text; tokens text[]; partial_text text := ''; token text; word_number integer := 0;
BEGIN
  IF check_kind NOT IN ('translation', 'glyphs') THEN RAISE EXCEPTION 'Unknown Arcana check'; END IF;
  SELECT * INTO lock_row FROM arcane_lock_instances WHERE id = target_lock_id FOR UPDATE;
  IF lock_row.id IS NULL OR NOT public.arcane_is_session_member(lock_row.session_id) THEN RAISE EXCEPTION 'Not an accepted session member'; END IF;
  IF NOT EXISTS (SELECT 1 FROM arcane_effective_lock_access WHERE lock_id = lock_row.id AND user_id = auth.uid() AND effective_can_read) AND NOT public.arcane_is_session_gm(lock_row.session_id) THEN
    RAISE EXCEPTION 'You must be able to examine the lock';
  END IF;
  SELECT * INTO character_row FROM characters WHERE id = target_character_id AND user_id = auth.uid()::text AND is_active = true;
  IF character_row.id IS NULL THEN RAISE EXCEPTION 'Choose one of your active characters'; END IF;
  SELECT * INTO template_row FROM arcane_lock_templates WHERE id = lock_row.template_id;
  modifier := public.arcane_character_modifier(character_row); dc := public.arcane_lock_dc(template_row.difficulty);
  INSERT INTO arcane_lock_knowledge(lock_id, user_id, generation, character_id, character_name, arcana_modifier)
  VALUES (lock_row.id, auth.uid(), lock_row.generation, character_row.id, character_row.name, modifier)
  ON CONFLICT (lock_id, user_id, generation) DO NOTHING;
  SELECT * INTO knowledge FROM arcane_lock_knowledge WHERE lock_id = lock_row.id AND user_id = auth.uid() AND generation = lock_row.generation FOR UPDATE;
  IF knowledge.character_id <> target_character_id THEN RAISE EXCEPTION 'This lock is already bound to %', knowledge.character_name; END IF;
  IF check_kind = 'translation' AND knowledge.translation_attempted THEN RAISE EXCEPTION 'Translation attempt already used'; END IF;
  IF check_kind = 'glyphs' AND knowledge.glyph_rolls_used >= 3 THEN RAISE EXCEPTION 'All glyph rolls have been used'; END IF;

  die_roll := floor(random() * 20 + 1)::integer; total := die_roll + modifier;
  rank := CASE WHEN total >= dc + 10 THEN 3 WHEN total >= dc THEN 2 WHEN total <= dc - 10 THEN 0 ELSE 1 END;
  IF die_roll = 20 THEN rank := LEAST(3, rank + 1); ELSIF die_roll = 1 THEN rank := GREATEST(0, rank - 1); END IF;
  degree := (ARRAY['critical_failure','failure','success','critical_success'])[rank + 1];

  IF check_kind = 'translation' THEN
    inscription := template_row.protected_definition->>'inscription';
    IF degree = 'critical_success' THEN partial_text := inscription;
    ELSIF degree = 'success' THEN
      tokens := regexp_split_to_array(inscription, '(\s+)');
      FOREACH token IN ARRAY tokens LOOP
        word_number := word_number + 1;
        partial_text := partial_text || CASE WHEN word_number % 3 = 1 THEN token ELSE '••••' END || ' ';
      END LOOP;
      partial_text := trim(partial_text);
    ELSE partial_text := NULL;
    END IF;
    UPDATE arcane_lock_knowledge SET translation_attempted = true, translation_degree = degree, translation_text = partial_text, updated_at = now()
      WHERE lock_id = lock_row.id AND user_id = auth.uid() AND generation = lock_row.generation;
  ELSE
    reveal_count := CASE degree WHEN 'critical_success' THEN 5 WHEN 'success' THEN 3 WHEN 'failure' THEN 2 ELSE 1 END;
    SELECT COALESCE(array_agg(DISTINCT glyph_id), '{}') INTO all_ids FROM (
      SELECT jsonb_array_elements_text(ring->'glyphIds') glyph_id FROM jsonb_array_elements(template_row.public_definition->'rings') ring
    ) ids WHERE glyph_id <> 'empty-slot';
    used_ids := knowledge.revealed_glyph_ids;
    FOR candidate IN SELECT value FROM unnest(all_ids) value WHERE NOT (value = ANY(used_ids)) ORDER BY random() LIMIT reveal_count LOOP
      new_ids := array_append(new_ids, candidate);
    END LOOP;
    UPDATE arcane_lock_knowledge SET glyph_rolls_used = glyph_rolls_used + 1, revealed_glyph_ids = revealed_glyph_ids || new_ids, updated_at = now()
      WHERE lock_id = lock_row.id AND user_id = auth.uid() AND generation = lock_row.generation;
  END IF;

  RETURN public.get_arcane_lock_knowledge(target_lock_id) || jsonb_build_object(
    'kind', check_kind, 'dieRoll', die_roll, 'total', total, 'degree', degree, 'newlyRevealedGlyphIds', to_jsonb(new_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_arcane_lock_knowledge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.roll_arcane_lock_knowledge(uuid, uuid, text) TO authenticated;
REVOKE ALL ON TABLE arcane_lock_knowledge FROM anon, authenticated;
-- Template rows contain protected inscriptions and solution rules. They are RPC-only.
REVOKE SELECT ON TABLE arcane_lock_templates FROM anon, authenticated;

-- Keep proximity permission in the view, but do not use it as knowledge permission.
-- GMs retain the full troubleshooting view; player inscriptions come only from the roll RPC.
ALTER FUNCTION public.get_arcane_lock_view_for_current_user(uuid, uuid)
  RENAME TO get_arcane_lock_view_before_knowledge_checks;
REVOKE ALL ON FUNCTION public.get_arcane_lock_view_before_knowledge_checks(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_arcane_lock_view_for_current_user(target_session_id uuid, target_lock_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  result := public.get_arcane_lock_view_before_knowledge_checks(target_session_id, target_lock_id);
  IF result #>> '{session,currentUserRole}' <> 'gm' THEN
    result := jsonb_set(result, '{inscription}', to_jsonb(COALESCE(result #>> '{publicDefinition,obscuredInscription}', 'The runes resist translation.')));
    result := jsonb_set(result, '{translatedHint}', 'null'::jsonb);
  END IF;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_arcane_lock_view_for_current_user(uuid, uuid) TO authenticated;
