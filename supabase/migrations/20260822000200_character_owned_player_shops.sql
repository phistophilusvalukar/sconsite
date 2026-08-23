-- Forward migration for databases that already applied the original marketplace schema.
ALTER TABLE public.player_shops ADD COLUMN IF NOT EXISTS character_id uuid REFERENCES public.characters(id) ON DELETE CASCADE;
ALTER TABLE public.player_shops DROP CONSTRAINT IF EXISTS player_shops_owner_id_key;

UPDATE public.player_shops shop SET character_id = (
  SELECT character.id FROM public.characters character
  JOIN public.users owner ON owner.auth_user_id=character.user_id
  WHERE owner.id=shop.owner_id AND character.character_status='active'
  ORDER BY character.created_at LIMIT 1
) WHERE shop.character_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS player_shops_character_id_key ON public.player_shops(character_id) WHERE character_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.marketplace_bonus_at_level(p_bonus jsonb, p_level integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_set(CASE WHEN COALESCE(p_bonus->>'proficiency','') IN ('untrained','trained','expert','master','legendary')
    THEN COALESCE(p_bonus,'{}') ELSE jsonb_set(COALESCE(p_bonus,'{}'),'{proficiency}','"untrained"',true) END,
    '{level}',to_jsonb(p_level),true);
$$;

CREATE OR REPLACE FUNCTION public.marketplace_ritual_skills_at_level(p_skills jsonb, p_level integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_set(skill,'{bonus}',public.marketplace_bonus_at_level(skill->'bonus',p_level),true)),'[]')
  FROM jsonb_array_elements(COALESCE(p_skills,'[]')) skill;
$$;

CREATE OR REPLACE FUNCTION public.get_my_shop_characters()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',c.id,'name',c.name,
    'level',COALESCE(NULLIF(active_file.json_data #>> '{system,details,level,value}','')::int,NULLIF(c.foundry_json #>> '{system,details,level,value}','')::int,c.level,1),
    'avatar',COALESCE(active_file.json_data->>'img',c.foundry_json->>'img',c.stats->>'avatar')
  ) ORDER BY c.name),'[]')
  FROM public.characters c
  LEFT JOIN public.character_foundry_files active_file ON active_file.character_id=c.id AND active_file.is_active=true
  WHERE c.user_id=auth.uid()::text AND c.character_status='active';
$$;

CREATE OR REPLACE FUNCTION public.get_marketplace_shops()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',s.id,'owner_id',u.auth_user_id,'owner_name',u.username,'owner_avatar',u.avatar,
    'discord_user_id',s.discord_user_id,'character_id',c.id,'character_name',c.name,
    'character_avatar',COALESCE(active_file.json_data->>'img',c.foundry_json->>'img',c.stats->>'avatar'),
    'kind',s.kind,'title',s.title,'description',s.description,'image_url',s.image_url,'tags',s.tags,
    'specialty',s.specialty,'tier',s.tier,'overall_discount_percent',s.overall_discount_percent,'feats',s.feats,
    'crafting_bonus',public.marketplace_bonus_at_level(s.crafting_bonus,levels.current_level),
    'crafting_assurance',s.crafting_assurance,'crafting_degree_boost',s.crafting_degree_boost,
    'ritual_skills',public.marketplace_ritual_skills_at_level(s.ritual_skills,levels.current_level),
    'rituals',s.rituals,'contributors',s.contributors,'accepts_commissions',s.accepts_commissions,'updated_at',s.updated_at
  ) ORDER BY s.updated_at DESC),'[]')
  FROM public.player_shops s JOIN public.users u ON u.id=s.owner_id JOIN public.characters c ON c.id=s.character_id
  LEFT JOIN public.character_foundry_files active_file ON active_file.character_id=c.id AND active_file.is_active=true
  CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(active_file.json_data #>> '{system,details,level,value}','')::int,NULLIF(c.foundry_json #>> '{system,details,level,value}','')::int,c.level,1) current_level) levels;
$$;

CREATE OR REPLACE FUNCTION public.upsert_player_shop_command(p_shop jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE actor_id uuid; result_id uuid; requested_id uuid; selected_character public.characters; active_foundry jsonb; character_level int; normalized_crafting_bonus jsonb; normalized_ritual_skills jsonb; shop_kind text; shop_title text; shop_description text;
BEGIN
  SELECT id INTO actor_id FROM public.users WHERE auth_user_id=auth.uid()::text LIMIT 1;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;
  SELECT * INTO selected_character FROM public.characters WHERE id=(p_shop->>'characterId')::uuid AND user_id=auth.uid()::text AND character_status='active';
  IF selected_character.id IS NULL THEN RAISE EXCEPTION 'Choose one of your active characters'; END IF;
  SELECT json_data INTO active_foundry FROM public.character_foundry_files WHERE character_id=selected_character.id AND is_active=true LIMIT 1;
  character_level:=COALESCE(NULLIF(active_foundry #>> '{system,details,level,value}','')::int,NULLIF(selected_character.foundry_json #>> '{system,details,level,value}','')::int,selected_character.level,1);
  normalized_crafting_bonus:=public.marketplace_bonus_at_level(p_shop->'craftingBonus',character_level);
  normalized_ritual_skills:=public.marketplace_ritual_skills_at_level(p_shop->'ritualSkills',character_level);
  shop_kind:=p_shop->>'kind'; shop_title:=trim(p_shop->>'title'); shop_description:=trim(p_shop->>'description');
  IF shop_kind NOT IN ('crafting','ritual') OR char_length(shop_title) NOT BETWEEN 3 AND 80 OR char_length(shop_description) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'Invalid shop profile'; END IF;
  IF p_shop ? 'id' AND NULLIF(p_shop->>'id','') IS NOT NULL THEN requested_id:=(p_shop->>'id')::uuid; END IF;
  IF requested_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.player_shops WHERE id=requested_id AND owner_id=actor_id AND character_id=selected_character.id) THEN RAISE EXCEPTION 'Shop not owned by this character'; END IF;
  INSERT INTO public.player_shops(id,owner_id,character_id,kind,title,description,image_url,discord_user_id,tags,specialty,tier,overall_discount_percent,feats,crafting_bonus,crafting_assurance,crafting_degree_boost,ritual_skills,rituals,contributors,accepts_commissions,updated_at)
  VALUES(COALESCE(requested_id,gen_random_uuid()),actor_id,selected_character.id,shop_kind,shop_title,shop_description,NULLIF(p_shop->>'imageUrl',''),NULLIF(p_shop->>'discordUserId',''),ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_shop->'tags','[]'))),NULLIF(p_shop->>'specialty',''),COALESCE((p_shop->>'tier')::int,1),COALESCE((p_shop->>'overallDiscountPercent')::int,0),COALESCE(p_shop->'feats','[]'),normalized_crafting_bonus,COALESCE((p_shop->>'craftingAssurance')::boolean,false),COALESCE(p_shop->>'craftingDegreeBoost',''),normalized_ritual_skills,COALESCE(p_shop->'rituals','[]'),COALESCE(p_shop->'contributors','[]'),COALESCE((p_shop->>'acceptsCommissions')::boolean,true),now())
  ON CONFLICT (character_id) WHERE character_id IS NOT NULL DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,description=EXCLUDED.description,image_url=EXCLUDED.image_url,discord_user_id=EXCLUDED.discord_user_id,tags=EXCLUDED.tags,specialty=EXCLUDED.specialty,tier=EXCLUDED.tier,overall_discount_percent=EXCLUDED.overall_discount_percent,feats=EXCLUDED.feats,crafting_bonus=EXCLUDED.crafting_bonus,crafting_assurance=EXCLUDED.crafting_assurance,crafting_degree_boost=EXCLUDED.crafting_degree_boost,ritual_skills=EXCLUDED.ritual_skills,rituals=EXCLUDED.rituals,contributors=EXCLUDED.contributors,accepts_commissions=EXCLUDED.accepts_commissions,updated_at=now()
  RETURNING id INTO result_id;
  RETURN result_id;
END; $$;

REVOKE ALL ON FUNCTION public.get_my_shop_characters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_shop_characters() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_shops() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_player_shop_command(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
