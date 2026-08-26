/* Consolidate shop pages onto Arcane and expose explicit color channels. */

ALTER TABLE public.player_shops
  ADD COLUMN IF NOT EXISTS page_secondary_color text NOT NULL DEFAULT '#38bdf8',
  ADD COLUMN IF NOT EXISTS page_background_color text NOT NULL DEFAULT '#0d0918',
  ADD COLUMN IF NOT EXISTS page_surface_color text NOT NULL DEFAULT '#151022',
  ADD COLUMN IF NOT EXISTS page_panel_color text NOT NULL DEFAULT '#201831';

UPDATE public.player_shops SET page_theme = 'arcane' WHERE page_theme <> 'arcane';

ALTER TABLE public.player_shops
  DROP CONSTRAINT IF EXISTS player_shops_page_theme_check,
  ADD CONSTRAINT player_shops_page_theme_check CHECK (page_theme = 'arcane'),
  DROP CONSTRAINT IF EXISTS player_shops_page_secondary_color_check,
  ADD CONSTRAINT player_shops_page_secondary_color_check CHECK (page_secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  DROP CONSTRAINT IF EXISTS player_shops_page_background_color_check,
  ADD CONSTRAINT player_shops_page_background_color_check CHECK (page_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  DROP CONSTRAINT IF EXISTS player_shops_page_surface_color_check,
  ADD CONSTRAINT player_shops_page_surface_color_check CHECK (page_surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  DROP CONSTRAINT IF EXISTS player_shops_page_panel_color_check,
  ADD CONSTRAINT player_shops_page_panel_color_check CHECK (page_panel_color ~ '^#[0-9A-Fa-f]{6}$');

CREATE OR REPLACE FUNCTION public.upsert_player_shop_v3_command(p_shop jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE
  actor_id uuid;
  result_id uuid;
  selected_secondary text := COALESCE(NULLIF(p_shop->>'pageSecondaryColor', ''), '#38bdf8');
  selected_background text := COALESCE(NULLIF(p_shop->>'pageBackgroundColor', ''), '#0d0918');
  selected_surface text := COALESCE(NULLIF(p_shop->>'pageSurfaceColor', ''), '#151022');
  selected_panel text := COALESCE(NULLIF(p_shop->>'pagePanelColor', ''), '#201831');
BEGIN
  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;
  IF selected_secondary !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop secondary color'; END IF;
  IF selected_background !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop background color'; END IF;
  IF selected_surface !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop surface color'; END IF;
  IF selected_panel !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop panel color'; END IF;

  result_id := public.upsert_player_shop_v2_command(p_shop || jsonb_build_object('pageTheme', 'arcane'));

  UPDATE public.player_shops
  SET page_theme = 'arcane',
      page_secondary_color = selected_secondary,
      page_background_color = selected_background,
      page_surface_color = selected_surface,
      page_panel_color = selected_panel,
      updated_at = now()
  WHERE id = result_id AND owner_id = actor_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Shop not owned by caller'; END IF;
  RETURN result_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_marketplace_shops_v2()
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

REVOKE ALL ON FUNCTION public.upsert_player_shop_v3_command(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketplace_shops_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_player_shop_v3_command(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_shops_v2() TO authenticated;

NOTIFY pgrst, 'reload schema';
