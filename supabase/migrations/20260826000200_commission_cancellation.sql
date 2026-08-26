/* Allow customers to cancel unpaid commissions and shop owners to cancel any active order. */

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
    (is_owner AND current_commission.status IN ('waiting_for_payment', 'in_progress') AND p_status = 'cancelled') OR
    (is_requester AND current_commission.status = 'waiting_for_payment' AND p_status IN ('in_progress', 'cancelled')) OR
    (is_owner AND current_commission.status = 'in_progress' AND p_status = 'completed')
  ) ELSE (
    is_owner AND (
      (current_commission.status = 'requested' AND p_status IN ('in_progress', 'declined', 'cancelled')) OR
      (current_commission.status = 'in_progress' AND p_status IN ('waiting_for_payment', 'cancelled')) OR
      (current_commission.status = 'waiting_for_payment' AND p_status IN ('in_progress', 'cancelled'))
    )
  ) OR (
    is_requester AND (
      (current_commission.status IN ('requested', 'in_progress', 'waiting_for_payment') AND p_status = 'cancelled') OR
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

REVOKE ALL ON FUNCTION public.update_shop_commission_status_v3_command(uuid, text, text, text, text, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_shop_commission_status_v3_command(uuid, text, text, text, text, text, numeric, integer) TO authenticated, service_role;
