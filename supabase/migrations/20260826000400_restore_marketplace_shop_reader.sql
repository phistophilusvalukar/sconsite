/* Keep the stable marketplace reader name while returning Arcane customization channels. */

CREATE OR REPLACE FUNCTION public.get_marketplace_shops()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'owner_id', u.auth_user_id, 'owner_name', u.username, 'owner_avatar', u.avatar,
    'discord_user_id', s.discord_user_id, 'discord_pings_enabled', s.discord_pings_enabled,
    'character_id', c.id, 'character_name', c.name,
    'character_avatar', COALESCE(active_file.json_data->>'img', c.foundry_json->>'img', c.stats->>'avatar'),
    'kind', s.kind, 'title', s.title, 'description', s.description, 'image_url', s.image_url,
    'page_theme', 'arcane', 'page_accent_color', s.page_accent_color,
    'page_secondary_color', s.page_secondary_color, 'page_background_color', s.page_background_color,
    'page_surface_color', s.page_surface_color, 'page_panel_color', s.page_panel_color,
    'page_background_image_url', s.page_background_image_url, 'page_tagline', s.page_tagline,
    'tags', s.tags, 'specialty', s.specialty, 'tier', s.tier,
    'overall_discount_percent', s.overall_discount_percent, 'feats', s.feats,
    'crafting_bonus', public.marketplace_bonus_at_level(s.crafting_bonus, levels.current_level),
    'crafting_assurance', s.crafting_assurance, 'crafting_degree_boost', s.crafting_degree_boost,
    'ritual_skills', public.marketplace_ritual_skills_at_level(s.ritual_skills, levels.current_level),
    'rituals', s.rituals, 'contributors', s.contributors,
    'accepts_commissions', s.accepts_commissions, 'updated_at', s.updated_at
  ) ORDER BY s.updated_at DESC), '[]'::jsonb)
  FROM public.player_shops s
  JOIN public.users u ON u.id = s.owner_id
  JOIN public.characters c ON c.id = s.character_id
  LEFT JOIN public.character_foundry_files active_file ON active_file.character_id = c.id AND active_file.is_active = true
  CROSS JOIN LATERAL (SELECT COALESCE(
    NULLIF(active_file.json_data #>> '{system,details,level,value}', '')::int,
    NULLIF(c.foundry_json #>> '{system,details,level,value}', '')::int, c.level, 1
  ) AS current_level) levels;
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_shops() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_shops() TO authenticated;

NOTIFY pgrst, 'reload schema';
