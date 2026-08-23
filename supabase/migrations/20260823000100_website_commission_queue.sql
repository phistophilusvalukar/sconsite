ALTER TABLE public.player_shops ADD COLUMN IF NOT EXISTS discord_pings_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_shop_discord_preferences_command(p_shop_id uuid, p_enabled boolean, p_discord_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE actor_id uuid;
BEGIN
  SELECT id INTO actor_id FROM public.users WHERE auth_user_id=auth.uid()::text LIMIT 1;
  IF p_enabled AND COALESCE(p_discord_user_id,'') !~ '^\d{17,20}$' THEN RAISE EXCEPTION 'A valid Discord user ID is required when pings are enabled'; END IF;
  UPDATE public.player_shops SET discord_pings_enabled=p_enabled,discord_user_id=CASE WHEN p_enabled THEN p_discord_user_id ELSE NULL END,updated_at=now() WHERE id=p_shop_id AND owner_id=actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shop not owned by caller'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_shop_commissions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
  WITH actor AS (SELECT id FROM public.users WHERE auth_user_id=auth.uid()::text LIMIT 1), rows AS (
    SELECT commission.*,shop.title shop_title,character.name character_name,requester.username requester_name,'owner'::text perspective
    FROM public.shop_commissions commission JOIN public.player_shops shop ON shop.id=commission.shop_id JOIN public.characters character ON character.id=shop.character_id JOIN public.users requester ON requester.id=commission.requester_id WHERE shop.owner_id=(SELECT id FROM actor)
    UNION ALL
    SELECT commission.*,shop.title shop_title,character.name character_name,requester.username requester_name,'requester'::text perspective
    FROM public.shop_commissions commission JOIN public.player_shops shop ON shop.id=commission.shop_id JOIN public.characters character ON character.id=shop.character_id JOIN public.users requester ON requester.id=commission.requester_id WHERE commission.requester_id=(SELECT id FROM actor)
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'shop_id',shop_id,'shop_title',shop_title,'character_name',character_name,'requester_name',requester_name,'item_name',item_name,'aon_url',aon_url,'item_tier',item_tier,'quantity',quantity,'budget',budget,'deadline',deadline,'details',details,'needs_secondary_help',needs_secondary_help,'status',status,'created_at',created_at,'updated_at',updated_at,'perspective',perspective) ORDER BY created_at DESC),'[]') FROM rows;
$$;

CREATE OR REPLACE FUNCTION public.update_shop_commission_status_command(p_commission_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE actor_id uuid; current_commission public.shop_commissions; is_owner boolean;
BEGIN
  SELECT id INTO actor_id FROM public.users WHERE auth_user_id=auth.uid()::text LIMIT 1;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;
  SELECT * INTO current_commission FROM public.shop_commissions WHERE id=p_commission_id;
  IF current_commission.id IS NULL THEN RAISE EXCEPTION 'Commission not found'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.player_shops WHERE id=current_commission.shop_id AND owner_id=actor_id) INTO is_owner;
  IF is_owner AND NOT ((current_commission.status='requested' AND p_status IN ('accepted','declined')) OR (current_commission.status='accepted' AND p_status='completed')) THEN RAISE EXCEPTION 'Invalid owner status transition'; END IF;
  IF NOT is_owner AND current_commission.requester_id=actor_id AND NOT (current_commission.status IN ('requested','accepted') AND p_status='cancelled') THEN RAISE EXCEPTION 'Invalid requester status transition'; END IF;
  IF NOT is_owner AND current_commission.requester_id<>actor_id THEN RAISE EXCEPTION 'Commission not accessible'; END IF;
  UPDATE public.shop_commissions SET status=p_status,updated_at=now() WHERE id=p_commission_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_commission_discord_delivery_command(p_commission_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
  SELECT jsonb_build_object('enabled',shop.discord_pings_enabled,'discordUserId',shop.discord_user_id)
  FROM public.shop_commissions commission JOIN public.player_shops shop ON shop.id=commission.shop_id JOIN public.users requester ON requester.id=commission.requester_id
  WHERE commission.id=p_commission_id AND requester.auth_user_id=auth.uid()::text;
$$;

CREATE OR REPLACE FUNCTION public.get_marketplace_shops()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'owner_id',u.auth_user_id,'owner_name',u.username,'owner_avatar',u.avatar,'discord_user_id',s.discord_user_id,'discord_pings_enabled',s.discord_pings_enabled,'character_id',c.id,'character_name',c.name,'character_avatar',COALESCE(active_file.json_data->>'img',c.foundry_json->>'img',c.stats->>'avatar'),'kind',s.kind,'title',s.title,'description',s.description,'image_url',s.image_url,'tags',s.tags,'specialty',s.specialty,'tier',s.tier,'overall_discount_percent',s.overall_discount_percent,'feats',s.feats,'crafting_bonus',public.marketplace_bonus_at_level(s.crafting_bonus,levels.current_level),'crafting_assurance',s.crafting_assurance,'crafting_degree_boost',s.crafting_degree_boost,'ritual_skills',public.marketplace_ritual_skills_at_level(s.ritual_skills,levels.current_level),'rituals',s.rituals,'contributors',s.contributors,'accepts_commissions',s.accepts_commissions,'updated_at',s.updated_at) ORDER BY s.updated_at DESC),'[]')
  FROM public.player_shops s JOIN public.users u ON u.id=s.owner_id JOIN public.characters c ON c.id=s.character_id LEFT JOIN public.character_foundry_files active_file ON active_file.character_id=c.id AND active_file.is_active=true CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(active_file.json_data #>> '{system,details,level,value}','')::int,NULLIF(c.foundry_json #>> '{system,details,level,value}','')::int,c.level,1) current_level) levels;
$$;

REVOKE ALL ON FUNCTION public.set_shop_discord_preferences_command(uuid,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_shop_commissions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_shop_commission_status_command(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_commission_discord_delivery_command(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_shop_discord_preferences_command(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_shop_commissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shop_commission_status_command(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_discord_delivery_command(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
