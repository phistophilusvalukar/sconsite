/*
  # Opt-in public character profiles

  Character owners can publish a dedicated, read-only profile URL. Anonymous
  readers receive an explicit allowlist of presentation data through a
  security-definer function; private Foundry data, equipment, owner IDs, hidden
  sections, pending relationships, and private relationship partners are never
  returned.
*/

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS profile_is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_characters_public_profiles
  ON public.characters (id)
  WHERE profile_is_public = true AND is_active = true;

CREATE OR REPLACE FUNCTION public.guard_character_profile_visibility_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_visibility_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_visibility_changed := NEW.profile_is_public;
  ELSE
    v_visibility_changed := NEW.profile_is_public IS DISTINCT FROM OLD.profile_is_public;
  END IF;

  IF v_visibility_changed
     AND COALESCE(current_setting('app.character_profile_visibility_write', true), '') <> 'allowed' THEN
    RAISE EXCEPTION 'Character profile visibility must be changed through the protected command'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_character_profile_visibility_write() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_character_profile_visibility_write ON public.characters;
CREATE TRIGGER guard_character_profile_visibility_write
  BEFORE UPDATE OF profile_is_public ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_character_profile_visibility_write();

DROP TRIGGER IF EXISTS guard_character_profile_visibility_insert ON public.characters;
CREATE TRIGGER guard_character_profile_visibility_insert
  BEFORE INSERT ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_character_profile_visibility_write();

CREATE OR REPLACE FUNCTION public.update_character_profile_v4_command(
  p_character_id uuid,
  p_profile jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_public boolean;
  v_updated boolean;
  v_row_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF jsonb_typeof(p_profile->'isPublic') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid public profile setting';
  END IF;
  v_is_public := (p_profile->>'isPublic')::boolean;

  v_updated := public.update_character_profile_v3_command(p_character_id, p_profile);
  IF v_updated THEN
    PERFORM set_config('app.character_profile_visibility_write', 'allowed', true);
    UPDATE public.characters
    SET profile_is_public = v_is_public,
        updated_at = now()
    WHERE id = p_character_id
      AND user_id = auth.uid()::text;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    PERFORM set_config('app.character_profile_visibility_write', '', true);
  END IF;

  RETURN v_updated AND v_row_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v3_command(uuid, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_character_profile_v4_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v4_command(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_character_profile(p_character_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_character public.characters%ROWTYPE;
  v_sections jsonb;
  v_show_portrait boolean;
  v_show_details boolean;
  v_show_abilities boolean;
  v_show_backstory boolean;
  v_show_notes boolean;
  v_show_journal boolean;
  v_show_relationships boolean;
  v_character_json jsonb;
  v_journal_entries jsonb := '[]'::jsonb;
  v_relationships jsonb := '[]'::jsonb;
  v_related_names jsonb := '{}'::jsonb;
BEGIN
  SELECT c.*
  INTO v_character
  FROM public.characters c
  WHERE c.id = p_character_id
    AND c.profile_is_public = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_sections := COALESCE(v_character.profile_section_visibility, '{}'::jsonb);
  v_show_portrait := COALESCE((v_sections->>'portrait')::boolean, true);
  v_show_details := COALESCE((v_sections->>'details')::boolean, true);
  v_show_abilities := COALESCE((v_sections->>'abilityMatrix')::boolean, true);
  v_show_backstory := COALESCE((v_sections->>'backstory')::boolean, true);
  v_show_notes := COALESCE((v_sections->>'notes')::boolean, true);
  v_show_journal := COALESCE((v_sections->>'journal')::boolean, true);
  v_show_relationships := COALESCE((v_sections->>'relationships')::boolean, true);

  v_character_json := jsonb_build_object(
    'id', v_character.id,
    'user_id', '',
    'name', v_character.name,
    'class', v_character.class,
    'class_primary', v_character.class_primary,
    'class_secondary', v_character.class_secondary,
    'level', v_character.level,
    'race', CASE WHEN v_show_details THEN v_character.race ELSE '' END,
    'ancestry', CASE WHEN v_show_details THEN v_character.ancestry ELSE NULL END,
    'heritage', CASE WHEN v_show_details THEN v_character.heritage ELSE NULL END,
    'background', CASE WHEN v_show_details THEN v_character.background ELSE NULL END,
    'stats', jsonb_strip_nulls(jsonb_build_object(
      'avatar', CASE WHEN v_show_portrait THEN v_character.stats->'avatar' ELSE NULL END,
      'abilityBoosts', CASE WHEN v_show_abilities THEN v_character.stats->'abilityBoosts' ELSE NULL END,
      'age', CASE WHEN v_show_details THEN v_character.stats->'age' ELSE NULL END,
      'height', CASE WHEN v_show_details THEN v_character.stats->'height' ELSE NULL END,
      'weight', CASE WHEN v_show_details THEN v_character.stats->'weight' ELSE NULL END,
      'wealth', CASE WHEN v_show_details THEN v_character.stats->'wealth' ELSE NULL END
    )),
    'equipment', '[]'::jsonb,
    'foundry_json', NULL,
    'foundry_file_name', NULL,
    'main_role', v_character.main_role,
    'role_badges', COALESCE(to_jsonb(v_character.role_badges), '[]'::jsonb),
    'backstory', CASE WHEN v_show_backstory THEN v_character.backstory ELSE NULL END,
    'notes', CASE WHEN v_show_notes THEN v_character.notes ELSE NULL END,
    'is_active', true,
    'profile_is_public', true,
    'guild_id', NULL
  ) || jsonb_build_object(
    'profile_subtitle', v_character.profile_subtitle,
    'profile_title_font_family', v_character.profile_title_font_family,
    'profile_subtitle_font_family', v_character.profile_subtitle_font_family,
    'profile_font_family', v_character.profile_font_family,
    'profile_title_font_size', v_character.profile_title_font_size,
    'profile_subtitle_font_size', v_character.profile_subtitle_font_size,
    'profile_text_font_size', v_character.profile_text_font_size,
    'profile_border_theme', v_character.profile_border_theme,
    'profile_background_theme', v_character.profile_background_theme,
    'profile_border_color_source', v_character.profile_border_color_source,
    'profile_background_color_source', v_character.profile_background_color_source,
    'profile_font_color', v_character.profile_font_color,
    'profile_base_color', v_character.profile_base_color,
    'profile_accent_color', v_character.profile_accent_color,
    'profile_background_mode', v_character.profile_background_mode,
    'profile_gradient_color', v_character.profile_gradient_color,
    'profile_gradient_orientation', v_character.profile_gradient_orientation,
    'profile_gradient_transition_rate', v_character.profile_gradient_transition_rate,
    'profile_banner_image_url', v_character.profile_banner_image_url,
    'profile_dynamic_portrait_enabled', CASE WHEN v_show_portrait THEN v_character.profile_dynamic_portrait_enabled ELSE false END,
    'profile_portrait_background_url', CASE WHEN v_show_portrait THEN v_character.profile_portrait_background_url ELSE NULL END,
    'profile_portrait_cutout_url', CASE WHEN v_show_portrait THEN v_character.profile_portrait_cutout_url ELSE NULL END,
    'profile_portrait_background_scale', v_character.profile_portrait_background_scale,
    'profile_portrait_background_position_x', v_character.profile_portrait_background_position_x,
    'profile_portrait_background_position_y', v_character.profile_portrait_background_position_y,
    'profile_portrait_cutout_scale', v_character.profile_portrait_cutout_scale,
    'profile_portrait_cutout_position_x', v_character.profile_portrait_cutout_position_x,
    'profile_portrait_cutout_position_y', v_character.profile_portrait_cutout_position_y,
    'profile_portrait_focus_x', v_character.profile_portrait_focus_x,
    'profile_portrait_focus_y', v_character.profile_portrait_focus_y,
    'profile_layout_style', v_character.profile_layout_style,
    'profile_section_visibility', v_sections,
    'created_at', v_character.created_at,
    'updated_at', v_character.updated_at
  );

  IF v_show_journal THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', entry.id,
          'characterId', entry.character_id,
          'authorId', '',
          'title', entry.title,
          'body', entry.body,
          'likeCount', (SELECT count(*) FROM public.character_journal_likes journal_like WHERE journal_like.entry_id = entry.id),
          'likedByCurrentUser', false,
          'comments', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id', cm.id,
                  'entryId', cm.entry_id,
                  'authorId', '',
                  'body', cm.body,
                  'isEdited', cm.updated_at > cm.created_at + interval '1 second',
                  'createdAt', cm.created_at,
                  'updatedAt', cm.updated_at
                ) ORDER BY cm.created_at ASC
              ),
              '[]'::jsonb
            )
            FROM public.character_journal_comments cm
            WHERE cm.entry_id = entry.id
          ),
          'createdAt', entry.created_at,
          'updatedAt', entry.updated_at
        ) ORDER BY entry.created_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_journal_entries
    FROM public.character_journal_entries entry
    WHERE entry.character_id = p_character_id;
  END IF;

  IF v_show_relationships THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'sourceCharacterId', r.source_character_id,
          'targetCharacterId', r.target_character_id,
          'name', r.relationship_name,
          'tag', r.relationship_tag,
          'sentiment', r.sentiment_value,
          'sourceApproved', true,
          'targetApproved', true,
          'confirmedAt', r.confirmed_at,
          'createdAt', r.created_at,
          'updatedAt', r.updated_at
        ) ORDER BY r.created_at ASC
      ),
      '[]'::jsonb
    )
    INTO v_relationships
    FROM public.character_relationships r
    JOIN public.characters related_character
      ON related_character.id = CASE
        WHEN r.source_character_id = p_character_id THEN r.target_character_id
        ELSE r.source_character_id
      END
    WHERE p_character_id IN (r.source_character_id, r.target_character_id)
      AND r.confirmed_at IS NOT NULL
      AND r.source_approved = true
      AND r.target_approved = true
      AND related_character.profile_is_public = true
      AND related_character.is_active = true;

    SELECT COALESCE(jsonb_object_agg(related_character.id::text, related_character.name), '{}'::jsonb)
    INTO v_related_names
    FROM public.characters related_character
    WHERE related_character.profile_is_public = true
      AND related_character.is_active = true
      AND EXISTS (
        SELECT 1
        FROM public.character_relationships r
        WHERE r.confirmed_at IS NOT NULL
          AND r.source_approved = true
          AND r.target_approved = true
          AND (
            (r.source_character_id = p_character_id AND r.target_character_id = related_character.id)
            OR (r.target_character_id = p_character_id AND r.source_character_id = related_character.id)
          )
      );
  END IF;

  RETURN jsonb_build_object(
    'character', v_character_json,
    'journalEntries', v_journal_entries,
    'relationships', v_relationships,
    'relatedCharacterNames', v_related_names
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;
