/* Require a recipient character and attach authoritative pricing to completed commission work. */

ALTER TABLE public.shop_commissions
  ADD COLUMN IF NOT EXISTS requester_character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS base_price_gp numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent integer,
  ADD COLUMN IF NOT EXISTS final_price_gp numeric(12,2),
  ADD COLUMN IF NOT EXISTS is_self_craft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.shop_commissions
  DROP CONSTRAINT IF EXISTS shop_commissions_base_price_gp_check,
  ADD CONSTRAINT shop_commissions_base_price_gp_check CHECK (base_price_gp IS NULL OR base_price_gp >= 0),
  DROP CONSTRAINT IF EXISTS shop_commissions_discount_percent_check,
  ADD CONSTRAINT shop_commissions_discount_percent_check CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS shop_commissions_final_price_gp_check,
  ADD CONSTRAINT shop_commissions_final_price_gp_check CHECK (final_price_gp IS NULL OR final_price_gp >= 0);

CREATE OR REPLACE FUNCTION public.create_shop_commission_command(p_commission jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE
  actor_id uuid;
  result_id uuid;
  target_shop public.player_shops;
  requester_record public.users;
  recipient_character public.characters;
  is_self_craft boolean := COALESCE((p_commission->>'selfCraft')::boolean, false);
  requested_base_price numeric := NULLIF(p_commission->>'basePriceGp', '')::numeric;
  requested_discount integer := NULLIF(p_commission->>'discountPercent', '')::integer;
  calculated_price numeric(12,2);
BEGIN
  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;

  SELECT * INTO target_shop FROM public.player_shops
  WHERE id = (p_commission->>'shopId')::uuid AND accepts_commissions = true;
  IF target_shop.id IS NULL THEN RAISE EXCEPTION 'Shop is not accepting commissions'; END IF;

  SELECT * INTO recipient_character FROM public.characters
  WHERE id = (p_commission->>'characterId')::uuid
    AND user_id = auth.uid()::text
    AND character_status = 'active';
  IF recipient_character.id IS NULL THEN RAISE EXCEPTION 'Choose one of your active characters as the commission recipient'; END IF;

  IF is_self_craft THEN
    IF target_shop.owner_id <> actor_id THEN RAISE EXCEPTION 'Only the shop owner may create a self-craft'; END IF;
    IF requested_base_price IS NULL OR requested_base_price < 0 THEN RAISE EXCEPTION 'A valid upfront base price is required'; END IF;
    IF requested_discount IS NULL OR requested_discount NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'A valid self-craft discount is required'; END IF;
    calculated_price := round(requested_base_price * (100 - requested_discount) / 100, 2);
  END IF;

  IF (p_commission->>'aonUrl') !~ '^https://2e\.aonprd\.com/' THEN
    RAISE EXCEPTION 'A valid Archives of Nethys 2e URL is required';
  END IF;

  INSERT INTO public.shop_commissions (
    shop_id, requester_id, requester_character_id, item_name, aon_url, item_tier, quantity,
    budget, deadline, details, needs_secondary_help, status, base_price_gp, discount_percent,
    final_price_gp, is_self_craft
  ) VALUES (
    target_shop.id, actor_id, recipient_character.id, trim(p_commission->>'itemName'), p_commission->>'aonUrl',
    COALESCE((p_commission->>'itemTier')::int, 0), COALESCE((p_commission->>'quantity')::int, 1),
    NULLIF(p_commission->>'budget', ''), NULLIF(p_commission->>'deadline', '')::date,
    trim(p_commission->>'details'), COALESCE((p_commission->>'needsSecondaryHelp')::boolean, false),
    CASE WHEN is_self_craft THEN 'waiting_for_payment' ELSE 'requested' END,
    CASE WHEN is_self_craft THEN requested_base_price ELSE NULL END,
    CASE WHEN is_self_craft THEN requested_discount ELSE NULL END,
    CASE WHEN is_self_craft THEN calculated_price ELSE NULL END,
    is_self_craft
  ) RETURNING id INTO result_id;

  SELECT * INTO requester_record FROM public.users WHERE id = actor_id;
  RETURN jsonb_build_object(
    'commissionId', result_id, 'shopTitle', target_shop.title, 'shopKind', target_shop.kind,
    'ownerDiscordId', target_shop.discord_user_id, 'requesterName', requester_record.username,
    'recipientCharacterName', recipient_character.name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_shop_commission_status_v3_command(
  p_commission_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_source text DEFAULT 'web',
  p_external_actor_id text DEFAULT NULL,
  p_actor_role text DEFAULT NULL,
  p_base_price_gp numeric DEFAULT NULL,
  p_discount_percent integer DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE
  actor_id uuid;
  current_commission public.shop_commissions;
  is_owner boolean := false;
  is_requester boolean := false;
  transition_allowed boolean := false;
  is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  calculated_price numeric(12,2);
  event_note text;
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

  transition_allowed := CASE WHEN current_commission.is_self_craft THEN (
    (is_requester AND current_commission.status = 'waiting_for_payment' AND p_status IN ('in_progress', 'cancelled')) OR
    (is_owner AND current_commission.status = 'in_progress' AND p_status = 'completed')
  ) ELSE (
    is_owner AND (
      (current_commission.status = 'requested' AND p_status IN ('in_progress', 'declined')) OR
      (current_commission.status = 'in_progress' AND p_status = 'waiting_for_payment') OR
      (current_commission.status = 'waiting_for_payment' AND p_status = 'in_progress')
    )
  ) OR (
    is_requester AND (
      (current_commission.status IN ('requested', 'in_progress') AND p_status = 'cancelled') OR
      (current_commission.status = 'waiting_for_payment' AND p_status = 'completed')
    )
  ) END;

  IF NOT is_owner AND NOT is_requester THEN RAISE EXCEPTION 'Commission not accessible'; END IF;
  IF NOT transition_allowed THEN RAISE EXCEPTION 'Invalid commission status transition'; END IF;

  IF NOT current_commission.is_self_craft AND current_commission.status = 'in_progress' AND p_status = 'waiting_for_payment' THEN
    IF NOT is_owner THEN RAISE EXCEPTION 'Only the shop owner may price completed work'; END IF;
    IF p_base_price_gp IS NULL OR p_base_price_gp < 0 THEN RAISE EXCEPTION 'A valid base price is required'; END IF;
    IF p_discount_percent IS NULL OR p_discount_percent NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'A valid discount is required'; END IF;
    calculated_price := round(p_base_price_gp * (100 - p_discount_percent) / 100, 2);
    UPDATE public.shop_commissions
    SET status = p_status, base_price_gp = p_base_price_gp, discount_percent = p_discount_percent,
        final_price_gp = calculated_price, updated_at = now()
    WHERE id = p_commission_id;
    event_note := COALESCE(NULLIF(trim(p_note), ''), format('Work completed. Base price %s gp, %s%% discount, final price %s gp.', p_base_price_gp, p_discount_percent, calculated_price));
  ELSE
    UPDATE public.shop_commissions
    SET status = p_status,
        paid_at = CASE
          WHEN current_commission.status = 'waiting_for_payment' AND p_status IN ('in_progress', 'completed') THEN now()
          ELSE paid_at
        END,
        updated_at = now()
    WHERE id = p_commission_id;
    event_note := NULLIF(trim(p_note), '');
  END IF;

  INSERT INTO public.shop_commission_events (
    commission_id, actor_id, source, from_status, to_status, note, external_actor_id
  ) VALUES (
    p_commission_id, actor_id, p_source, current_commission.status, p_status, event_note, p_external_actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shop_commission_log(p_shop_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  WITH actor AS (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1
  ), accessible AS (
    SELECT commission.*, shop.title AS shop_title, shop.owner_id,
      shop_character.name AS character_name, requester.username AS requester_name,
      recipient.name AS requester_character_name,
      COALESCE(recipient_file.json_data->>'img', recipient.foundry_json->>'img', recipient.stats->>'avatar') AS requester_character_avatar,
      shop.owner_id = (SELECT id FROM actor) AS is_owner,
      commission.requester_id = (SELECT id FROM actor) AS is_requester,
      CASE WHEN shop.owner_id = (SELECT id FROM actor) THEN 'owner' ELSE 'requester' END AS perspective
    FROM public.shop_commissions commission
    JOIN public.player_shops shop ON shop.id = commission.shop_id
    JOIN public.characters shop_character ON shop_character.id = shop.character_id
    JOIN public.users requester ON requester.id = commission.requester_id
    LEFT JOIN public.characters recipient ON recipient.id = commission.requester_character_id
    LEFT JOIN public.character_foundry_files recipient_file ON recipient_file.character_id = recipient.id AND recipient_file.is_active = true
    WHERE commission.shop_id = p_shop_id
      AND (shop.owner_id = (SELECT id FROM actor) OR commission.requester_id = (SELECT id FROM actor))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', commission.id, 'shop_id', commission.shop_id, 'shop_title', commission.shop_title,
    'character_name', commission.character_name, 'requester_name', commission.requester_name,
    'requester_character_id', commission.requester_character_id,
    'requester_character_name', commission.requester_character_name,
    'requester_character_avatar', commission.requester_character_avatar,
    'item_name', commission.item_name, 'aon_url', commission.aon_url, 'item_tier', commission.item_tier,
    'quantity', commission.quantity, 'budget', commission.budget, 'deadline', commission.deadline,
    'details', commission.details, 'needs_secondary_help', commission.needs_secondary_help,
    'status', commission.status, 'base_price_gp', commission.base_price_gp,
    'discount_percent', commission.discount_percent, 'final_price_gp', commission.final_price_gp,
    'is_self_craft', commission.is_self_craft, 'paid_at', commission.paid_at,
    'created_at', commission.created_at, 'updated_at', commission.updated_at,
    'perspective', commission.perspective, 'is_owner', commission.is_owner, 'is_requester', commission.is_requester,
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

CREATE OR REPLACE FUNCTION public.get_my_shop_commissions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  WITH actor AS (SELECT id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1), rows AS (
    SELECT commission.*, shop.title shop_title, shop_character.name character_name,
      requester.username requester_name, recipient.name requester_character_name,
      COALESCE(recipient_file.json_data->>'img',recipient.foundry_json->>'img',recipient.stats->>'avatar') requester_character_avatar,
      'owner'::text perspective, true is_owner, commission.requester_id=(SELECT id FROM actor) is_requester
    FROM public.shop_commissions commission
    JOIN public.player_shops shop ON shop.id=commission.shop_id
    JOIN public.characters shop_character ON shop_character.id=shop.character_id
    JOIN public.users requester ON requester.id=commission.requester_id
    LEFT JOIN public.characters recipient ON recipient.id=commission.requester_character_id
    LEFT JOIN public.character_foundry_files recipient_file ON recipient_file.character_id=recipient.id AND recipient_file.is_active=true
    WHERE shop.owner_id=(SELECT id FROM actor)
    UNION ALL
    SELECT commission.*, shop.title shop_title, shop_character.name character_name,
      requester.username requester_name, recipient.name requester_character_name,
      COALESCE(recipient_file.json_data->>'img',recipient.foundry_json->>'img',recipient.stats->>'avatar') requester_character_avatar,
      'requester'::text perspective, shop.owner_id=(SELECT id FROM actor) is_owner, true is_requester
    FROM public.shop_commissions commission
    JOIN public.player_shops shop ON shop.id=commission.shop_id
    JOIN public.characters shop_character ON shop_character.id=shop.character_id
    JOIN public.users requester ON requester.id=commission.requester_id
    LEFT JOIN public.characters recipient ON recipient.id=commission.requester_character_id
    LEFT JOIN public.character_foundry_files recipient_file ON recipient_file.character_id=recipient.id AND recipient_file.is_active=true
    WHERE commission.requester_id=(SELECT id FROM actor)
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',id,'shop_id',shop_id,'shop_title',shop_title,'character_name',character_name,'requester_name',requester_name,
    'requester_character_id',requester_character_id,'requester_character_name',requester_character_name,'requester_character_avatar',requester_character_avatar,
    'item_name',item_name,'aon_url',aon_url,'item_tier',item_tier,'quantity',quantity,'budget',budget,'deadline',deadline,
    'details',details,'needs_secondary_help',needs_secondary_help,'status',status,
    'base_price_gp',base_price_gp,'discount_percent',discount_percent,'final_price_gp',final_price_gp,
    'is_self_craft',is_self_craft,'paid_at',paid_at,
    'created_at',created_at,'updated_at',updated_at,'perspective',perspective,'is_owner',is_owner,'is_requester',is_requester
  ) ORDER BY created_at DESC),'[]') FROM rows;
$$;

REVOKE ALL ON FUNCTION public.update_shop_commission_status_v3_command(uuid, text, text, text, text, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_shop_commission_status_v3_command(uuid, text, text, text, text, text, numeric, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
