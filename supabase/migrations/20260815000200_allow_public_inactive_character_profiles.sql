/*
  # Simple read-only public character pages

  Publication is controlled only by profile_is_public. The RPC returns a
  sanitized character row and no interactive journal or relationship data.
*/

CREATE OR REPLACE FUNCTION public.get_public_character_page(p_character_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT jsonb_build_object(
    'character',
      jsonb_build_object(
        'id', c.id,
        'user_id', '',
        'name', c.name,
        'class', c.class,
        'class_primary', c.class_primary,
        'class_secondary', c.class_secondary,
        'level', c.level,
        'race', CASE WHEN COALESCE((c.profile_section_visibility->>'details')::boolean, true) THEN c.race ELSE '' END,
        'ancestry', CASE WHEN COALESCE((c.profile_section_visibility->>'details')::boolean, true) THEN c.ancestry ELSE NULL END,
        'heritage', CASE WHEN COALESCE((c.profile_section_visibility->>'details')::boolean, true) THEN c.heritage ELSE NULL END,
        'background', CASE WHEN COALESCE((c.profile_section_visibility->>'details')::boolean, true) THEN c.background ELSE NULL END,
        'stats', jsonb_strip_nulls(jsonb_build_object(
          'avatar', CASE WHEN COALESCE((c.profile_section_visibility->>'portrait')::boolean, true) THEN c.stats->'avatar' ELSE NULL END,
          'abilityBoosts', CASE WHEN COALESCE((c.profile_section_visibility->>'abilityMatrix')::boolean, true) THEN c.stats->'abilityBoosts' ELSE NULL END,
          'age', CASE WHEN COALESCE((c.profile_section_visibility->>'details')::boolean, true) THEN c.stats->'age' ELSE NULL END,
          'height', CASE WHEN COALESCE((c.profile_section_visibility->>'details')::boolean, true) THEN c.stats->'height' ELSE NULL END,
          'weight', CASE WHEN COALESCE((c.profile_section_visibility->>'details')::boolean, true) THEN c.stats->'weight' ELSE NULL END,
          'wealth', CASE WHEN COALESCE((c.profile_section_visibility->>'details')::boolean, true) THEN c.stats->'wealth' ELSE NULL END
        )),
        'equipment', '[]'::jsonb,
        'foundry_json', NULL,
        'foundry_file_name', NULL,
        'main_role', c.main_role,
        'role_badges', COALESCE(to_jsonb(c.role_badges), '[]'::jsonb),
        'backstory', CASE WHEN COALESCE((c.profile_section_visibility->>'backstory')::boolean, true) THEN c.backstory ELSE NULL END,
        'notes', CASE WHEN COALESCE((c.profile_section_visibility->>'notes')::boolean, true) THEN c.notes ELSE NULL END,
        'is_active', true,
        'profile_is_public', true,
        'guild_id', NULL
      ) || jsonb_build_object(
        'profile_subtitle', c.profile_subtitle,
        'profile_title_font_family', c.profile_title_font_family,
        'profile_subtitle_font_family', c.profile_subtitle_font_family,
        'profile_font_family', c.profile_font_family,
        'profile_title_font_size', c.profile_title_font_size,
        'profile_subtitle_font_size', c.profile_subtitle_font_size,
        'profile_text_font_size', c.profile_text_font_size,
        'profile_border_theme', c.profile_border_theme,
        'profile_background_theme', c.profile_background_theme,
        'profile_border_color_source', c.profile_border_color_source,
        'profile_background_color_source', c.profile_background_color_source,
        'profile_font_color', c.profile_font_color,
        'profile_base_color', c.profile_base_color,
        'profile_accent_color', c.profile_accent_color,
        'profile_background_mode', c.profile_background_mode,
        'profile_gradient_color', c.profile_gradient_color,
        'profile_gradient_orientation', c.profile_gradient_orientation,
        'profile_gradient_transition_rate', c.profile_gradient_transition_rate,
        'profile_banner_image_url', c.profile_banner_image_url,
        'profile_dynamic_portrait_enabled', CASE WHEN COALESCE((c.profile_section_visibility->>'portrait')::boolean, true) THEN c.profile_dynamic_portrait_enabled ELSE false END,
        'profile_portrait_background_url', CASE WHEN COALESCE((c.profile_section_visibility->>'portrait')::boolean, true) THEN c.profile_portrait_background_url ELSE NULL END,
        'profile_portrait_cutout_url', CASE WHEN COALESCE((c.profile_section_visibility->>'portrait')::boolean, true) THEN c.profile_portrait_cutout_url ELSE NULL END
      ) || jsonb_build_object(
        'profile_portrait_background_scale', c.profile_portrait_background_scale,
        'profile_portrait_background_position_x', c.profile_portrait_background_position_x,
        'profile_portrait_background_position_y', c.profile_portrait_background_position_y,
        'profile_portrait_cutout_scale', c.profile_portrait_cutout_scale,
        'profile_portrait_cutout_position_x', c.profile_portrait_cutout_position_x,
        'profile_portrait_cutout_position_y', c.profile_portrait_cutout_position_y,
        'profile_portrait_focus_x', c.profile_portrait_focus_x,
        'profile_portrait_focus_y', c.profile_portrait_focus_y,
        'profile_layout_style', c.profile_layout_style,
        'profile_section_visibility', COALESCE(c.profile_section_visibility, '{}'::jsonb),
        'created_at', c.created_at,
        'updated_at', c.updated_at
      ),
    'journalEntries', '[]'::jsonb,
    'relationships', '[]'::jsonb,
    'relatedCharacterNames', '{}'::jsonb
  )
  FROM public.characters c
  WHERE c.id = p_character_id
    AND c.profile_is_public = true;
$$;

REVOKE ALL ON FUNCTION public.get_public_character_page(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_page(uuid) TO anon, authenticated;
