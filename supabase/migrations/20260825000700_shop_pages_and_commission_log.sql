/* Character-owned shop pages and an append-only, Discord-ready commission workflow. */

ALTER TABLE public.player_shops
  ADD COLUMN IF NOT EXISTS page_theme text NOT NULL DEFAULT 'forge',
  ADD COLUMN IF NOT EXISTS page_accent_color text NOT NULL DEFAULT '#d1cabf',
  ADD COLUMN IF NOT EXISTS page_background_image_url text,
  ADD COLUMN IF NOT EXISTS page_tagline text NOT NULL DEFAULT '';

ALTER TABLE public.player_shops
  DROP CONSTRAINT IF EXISTS player_shops_page_theme_check,
  ADD CONSTRAINT player_shops_page_theme_check CHECK (page_theme IN ('forge', 'arcane', 'parchment')),
  DROP CONSTRAINT IF EXISTS player_shops_page_accent_color_check,
  ADD CONSTRAINT player_shops_page_accent_color_check CHECK (page_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  DROP CONSTRAINT IF EXISTS player_shops_page_tagline_check,
  ADD CONSTRAINT player_shops_page_tagline_check CHECK (char_length(page_tagline) <= 180);

ALTER TABLE public.shop_commissions
  DROP CONSTRAINT IF EXISTS shop_commissions_status_check;

UPDATE public.shop_commissions SET status = 'in_progress' WHERE status = 'accepted';

ALTER TABLE public.shop_commissions
  ADD CONSTRAINT shop_commissions_status_check
    CHECK (status IN ('requested', 'in_progress', 'waiting_for_payment', 'completed', 'declined', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.shop_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.shop_commissions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'discord', 'system')),
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('requested', 'in_progress', 'waiting_for_payment', 'completed', 'declined', 'cancelled')),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  external_actor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_commission_events_commission_created_idx
  ON public.shop_commission_events (commission_id, created_at);

ALTER TABLE public.shop_commission_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.shop_commission_events FROM anon, authenticated;
GRANT SELECT ON public.shop_commission_events TO authenticated;

DROP POLICY IF EXISTS shop_commission_events_participant_read ON public.shop_commission_events;
CREATE POLICY shop_commission_events_participant_read ON public.shop_commission_events
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.shop_commissions commission
    JOIN public.player_shops shop ON shop.id = commission.shop_id
    JOIN public.users actor ON actor.auth_user_id = auth.uid()::text
    WHERE commission.id = commission_id
      AND (commission.requester_id = actor.id OR shop.owner_id = actor.id)
  )
);

INSERT INTO public.shop_commission_events (commission_id, actor_id, source, from_status, to_status, note, created_at)
SELECT commission.id, commission.requester_id, 'system', NULL, commission.status, 'Imported from the existing commission queue.', commission.created_at
FROM public.shop_commissions commission
WHERE NOT EXISTS (SELECT 1 FROM public.shop_commission_events event WHERE event.commission_id = commission.id);

CREATE OR REPLACE FUNCTION public.log_new_shop_commission_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.shop_commission_events (commission_id, actor_id, source, from_status, to_status, note)
  VALUES (NEW.id, NEW.requester_id, 'web', NULL, NEW.status, 'Commission requested.');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_new_shop_commission_event ON public.shop_commissions;
CREATE TRIGGER log_new_shop_commission_event
AFTER INSERT ON public.shop_commissions
FOR EACH ROW EXECUTE FUNCTION public.log_new_shop_commission_event();

CREATE OR REPLACE FUNCTION public.upsert_player_shop_v2_command(p_shop jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE
  actor_id uuid;
  result_id uuid;
  selected_theme text := COALESCE(NULLIF(p_shop->>'pageTheme', ''), 'forge');
  selected_accent text := COALESCE(NULLIF(p_shop->>'pageAccentColor', ''), '#d1cabf');
  selected_background text := NULLIF(p_shop->>'pageBackgroundImageUrl', '');
  selected_tagline text := COALESCE(p_shop->>'pageTagline', '');
BEGIN
  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;
  IF selected_theme NOT IN ('forge', 'arcane', 'parchment') THEN RAISE EXCEPTION 'Invalid shop page theme'; END IF;
  IF selected_accent !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid shop accent color'; END IF;
  IF selected_background IS NOT NULL AND selected_background !~ '^https://' THEN RAISE EXCEPTION 'Shop background image must use HTTPS'; END IF;
  IF char_length(selected_tagline) > 180 THEN RAISE EXCEPTION 'Shop tagline is too long'; END IF;

  result_id := public.upsert_player_shop_command(p_shop);

  UPDATE public.player_shops
  SET page_theme = selected_theme,
      page_accent_color = selected_accent,
      page_background_image_url = selected_background,
      page_tagline = selected_tagline,
      updated_at = now()
  WHERE id = result_id AND owner_id = actor_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Shop not owned by caller'; END IF;
  RETURN result_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_shop_commission_status_v2_command(
  p_commission_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_source text DEFAULT 'web',
  p_external_actor_id text DEFAULT NULL,
  p_actor_role text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE
  actor_id uuid;
  current_commission public.shop_commissions;
  is_owner boolean := false;
  is_requester boolean := false;
  is_service boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF p_status NOT IN ('requested', 'in_progress', 'waiting_for_payment', 'completed', 'declined', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid commission status';
  END IF;
  IF p_source NOT IN ('web', 'discord', 'system') THEN RAISE EXCEPTION 'Invalid commission event source'; END IF;
  IF NOT is_service AND p_source <> 'web' THEN RAISE EXCEPTION 'Only server integrations may set an external event source'; END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN RAISE EXCEPTION 'Commission note is too long'; END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1;
  SELECT * INTO current_commission FROM public.shop_commissions WHERE id = p_commission_id FOR UPDATE;
  IF current_commission.id IS NULL THEN RAISE EXCEPTION 'Commission not found'; END IF;

  IF is_service THEN
    is_owner := p_actor_role = 'owner';
    is_requester := p_actor_role = 'requester';
  ELSE
    IF actor_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.player_shops WHERE id = current_commission.shop_id AND owner_id = actor_id) INTO is_owner;
    is_requester := current_commission.requester_id = actor_id;
  END IF;

  IF is_owner AND NOT (
    (current_commission.status = 'requested' AND p_status IN ('in_progress', 'declined')) OR
    (current_commission.status = 'in_progress' AND p_status = 'waiting_for_payment') OR
    (current_commission.status = 'waiting_for_payment' AND p_status = 'in_progress')
  ) THEN RAISE EXCEPTION 'Invalid shop-owner status transition'; END IF;

  IF NOT is_owner AND is_requester AND NOT (
    (current_commission.status IN ('requested', 'in_progress') AND p_status = 'cancelled') OR
    (current_commission.status = 'waiting_for_payment' AND p_status = 'completed')
  ) THEN RAISE EXCEPTION 'Invalid requester status transition'; END IF;

  IF NOT is_owner AND NOT is_requester THEN RAISE EXCEPTION 'Commission not accessible'; END IF;

  UPDATE public.shop_commissions SET status = p_status, updated_at = now() WHERE id = p_commission_id;
  INSERT INTO public.shop_commission_events (commission_id, actor_id, source, from_status, to_status, note, external_actor_id)
  VALUES (p_commission_id, actor_id, p_source, current_commission.status, p_status, NULLIF(trim(p_note), ''), p_external_actor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shop_commission_log(p_shop_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  WITH actor AS (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1
  ), accessible AS (
    SELECT commission.*, shop.title AS shop_title, character.name AS character_name,
      requester.username AS requester_name,
      CASE WHEN shop.owner_id = (SELECT id FROM actor) THEN 'owner' ELSE 'requester' END AS perspective
    FROM public.shop_commissions commission
    JOIN public.player_shops shop ON shop.id = commission.shop_id
    JOIN public.characters character ON character.id = shop.character_id
    JOIN public.users requester ON requester.id = commission.requester_id
    WHERE commission.shop_id = p_shop_id
      AND (shop.owner_id = (SELECT id FROM actor) OR commission.requester_id = (SELECT id FROM actor))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', commission.id, 'shop_id', commission.shop_id, 'shop_title', commission.shop_title,
    'character_name', commission.character_name, 'requester_name', commission.requester_name,
    'item_name', commission.item_name, 'aon_url', commission.aon_url, 'item_tier', commission.item_tier,
    'quantity', commission.quantity, 'budget', commission.budget, 'deadline', commission.deadline,
    'details', commission.details, 'needs_secondary_help', commission.needs_secondary_help,
    'status', commission.status, 'created_at', commission.created_at, 'updated_at', commission.updated_at,
    'perspective', commission.perspective,
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', event.id, 'source', event.source, 'from_status', event.from_status, 'to_status', event.to_status,
      'note', event.note, 'external_actor_id', event.external_actor_id, 'created_at', event.created_at,
      'actor_name', event_actor.username
    ) ORDER BY event.created_at)
    FROM public.shop_commission_events event
    LEFT JOIN public.users event_actor ON event_actor.id = event.actor_id
    WHERE event.commission_id = commission.id), '[]'::jsonb)
  ) ORDER BY commission.created_at DESC), '[]'::jsonb)
  FROM accessible commission;
$$;

CREATE OR REPLACE FUNCTION public.get_marketplace_shops()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'owner_id', u.auth_user_id, 'owner_name', u.username, 'owner_avatar', u.avatar,
    'discord_user_id', s.discord_user_id, 'discord_pings_enabled', s.discord_pings_enabled,
    'character_id', c.id, 'character_name', c.name,
    'character_avatar', COALESCE(active_file.json_data->>'img', c.foundry_json->>'img', c.stats->>'avatar'),
    'kind', s.kind, 'title', s.title, 'description', s.description, 'image_url', s.image_url,
    'page_theme', s.page_theme, 'page_accent_color', s.page_accent_color,
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

REVOKE ALL ON FUNCTION public.upsert_player_shop_v2_command(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_shop_commission_status_v2_command(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shop_commission_log(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_player_shop_v2_command(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shop_commission_status_v2_command(uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_shop_commission_log(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
