/* Keep the stable shop writer name while persisting all Arcane customization channels. */

CREATE OR REPLACE FUNCTION public.upsert_player_shop_v2_command(p_shop jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE
  actor_id uuid;
  result_id uuid;
  selected_accent text := COALESCE(NULLIF(p_shop->>'pageAccentColor', ''), '#a78bfa');
  selected_secondary text := COALESCE(NULLIF(p_shop->>'pageSecondaryColor', ''), '#38bdf8');
  selected_background text := COALESCE(NULLIF(p_shop->>'pageBackgroundColor', ''), '#0d0918');
  selected_surface text := COALESCE(NULLIF(p_shop->>'pageSurfaceColor', ''), '#151022');
  selected_panel text := COALESCE(NULLIF(p_shop->>'pagePanelColor', ''), '#201831');
  selected_splash text := NULLIF(p_shop->>'pageBackgroundImageUrl', '');
  selected_tagline text := COALESCE(p_shop->>'pageTagline', '');
BEGIN
  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;
  IF selected_accent !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop accent color'; END IF;
  IF selected_secondary !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop secondary color'; END IF;
  IF selected_background !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop background color'; END IF;
  IF selected_surface !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop surface color'; END IF;
  IF selected_panel !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop panel color'; END IF;
  IF selected_splash IS NOT NULL AND selected_splash !~ '^https://' THEN RAISE EXCEPTION 'Shop header splash image must use HTTPS'; END IF;
  IF char_length(selected_tagline) > 180 THEN RAISE EXCEPTION 'Shop tagline is too long'; END IF;

  result_id := public.upsert_player_shop_command(p_shop);

  UPDATE public.player_shops
  SET page_theme = 'arcane',
      page_accent_color = selected_accent,
      page_secondary_color = selected_secondary,
      page_background_color = selected_background,
      page_surface_color = selected_surface,
      page_panel_color = selected_panel,
      page_background_image_url = selected_splash,
      page_tagline = selected_tagline,
      updated_at = now()
  WHERE id = result_id AND owner_id = actor_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Shop not owned by caller'; END IF;
  RETURN result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_player_shop_v2_command(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_player_shop_v2_command(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
