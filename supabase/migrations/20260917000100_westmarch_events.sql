-- Westmarch initial checkpoint. Canonical writes are exclusively protected commands.
-- Defaults: total >= DC, 24-hour days, 7-day booking horizon, approval FIFO,
-- fixed-timestamp operational pauses. Reputation values await community policy.
CREATE TABLE public.wm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id text NOT NULL REFERENCES public.users(auth_user_id),
  definition jsonb NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','returned','rejected','queued','active','paused','completed','cancelled')),
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
  starts_at timestamptz, ends_at timestamptz, outcome text, review_note text NOT NULL DEFAULT ''
);
CREATE TABLE public.wm_slots (
  id integer PRIMARY KEY CHECK (id BETWEEN 1 AND 6), kind text NOT NULL CHECK (kind IN ('minor','meta')),
  event_id uuid UNIQUE REFERENCES public.wm_events(id), cooldown_until timestamptz,
  CHECK ((id = 6 AND kind = 'meta') OR (id < 6 AND kind = 'minor'))
);
INSERT INTO public.wm_slots(id,kind) SELECT n,CASE WHEN n=6 THEN 'meta' ELSE 'minor' END FROM generate_series(1,6) n;
CREATE TABLE public.wm_staff (
  user_id text PRIMARY KEY REFERENCES public.users(auth_user_id), granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wm_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES public.users(auth_user_id),
  motivation text NOT NULL, experience text NOT NULL, availability text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(), note text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX wm_one_pending_application ON public.wm_applications(user_id) WHERE status='pending';
CREATE TABLE public.wm_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.wm_events(id),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE RESTRICT,
  player_id text NOT NULL REFERENCES public.users(auth_user_id), character_name text NOT NULL,
  level integer NOT NULL CHECK(level BETWEEN 1 AND 20), action_id text NOT NULL, action_snapshot jsonb NOT NULL,
  kind text NOT NULL CHECK(kind IN ('aid','main')), skill text NOT NULL, modifier integer NOT NULL CHECK(modifier BETWEEN -20 AND 100),
  description text NOT NULL, die integer NOT NULL CHECK(die BETWEEN 1 AND 20), total integer NOT NULL,
  base_dc integer NOT NULL, final_dc integer, success boolean,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','void')),
  CHECK(ends_at>starts_at), CHECK(total=die+modifier),
  CHECK((status='completed' AND final_dc IS NOT NULL AND success IS NOT NULL) OR (status<>'completed' AND final_dc IS NULL AND success IS NULL))
);
CREATE INDEX wm_due_contributions ON public.wm_contributions(ends_at,kind) WHERE status='pending';
CREATE INDEX wm_character_schedule ON public.wm_contributions(character_id,starts_at,ends_at) WHERE status<>'void';
CREATE INDEX wm_event_contributions ON public.wm_contributions(event_id,action_id,status);
CREATE TABLE public.wm_milestones (
  event_id uuid NOT NULL REFERENCES public.wm_events(id), action_id text NOT NULL,
  reduction integer NOT NULL, unlocked_at timestamptz NOT NULL, PRIMARY KEY(event_id,action_id)
);
CREATE TABLE public.wm_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE REFERENCES public.wm_events(id),
  author_id text NOT NULL REFERENCES public.users(auth_user_id), code text NOT NULL UNIQUE DEFAULT ('EVT-'||upper(replace(gen_random_uuid()::text,'-',''))),
  status text NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','redeemed','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(), redeemed_at timestamptz, redeemed_by text REFERENCES public.users(auth_user_id)
);
CREATE TABLE public.wm_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text, actor_name text NOT NULL,
  action text NOT NULL, event_id uuid REFERENCES public.wm_events(id), reason text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wm_requests (
  user_id text NOT NULL REFERENCES public.users(auth_user_id), request_id uuid NOT NULL,
  command jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_id)
);

-- No client table access, including through pre-existing broad default grants.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['wm_events','wm_slots','wm_staff','wm_applications','wm_contributions','wm_milestones','wm_rewards','wm_log','wm_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
  END LOOP;
END $$;

CREATE FUNCTION public.wm_log_action(p_actor text,p_action text,p_event uuid,p_reason text DEFAULT '',p_details jsonb DEFAULT '{}')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  INSERT INTO public.wm_log(actor_id,actor_name,action,event_id,reason,details)
  VALUES(p_actor,COALESCE((SELECT username FROM public.users WHERE auth_user_id=p_actor),'System'),p_action,p_event,COALESCE(p_reason,''),p_details || jsonb_strip_nulls(jsonb_build_object('requestId',NULLIF(current_setting('app.wm_request_id',true),''))));
$$;

CREATE FUNCTION public.wm_validate_definition(d jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a jsonb; k text; n integer; ids text[] := '{}'; allowed text[] := ARRAY['Acrobatics','Arcana','Athletics','Crafting','Deception','Diplomacy','Intimidation','Lore','Medicine','Nature','Occultism','Perception','Performance','Religion','Society','Stealth','Survival','Thievery'];
BEGIN
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid event definition'; END IF;
  FOREACH k IN ARRAY ARRAY['title','kind','region','requester','location','description','successText','failureText'] LOOP
    IF jsonb_typeof(d->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Missing text field: %',k; END IF;
  END LOOP;
  IF d->>'kind' NOT IN ('minor','meta') OR length(trim(d->>'title')) NOT BETWEEN 3 AND 120
    OR length(trim(d->>'region')) NOT BETWEEN 2 AND 80 OR length(trim(d->>'requester')) NOT BETWEEN 2 AND 120
    OR length(d->>'location')>2000 OR length(trim(d->>'description')) NOT BETWEEN 20 AND 10000
    OR length(trim(d->>'successText')) NOT BETWEEN 5 AND 4000 OR length(trim(d->>'failureText')) NOT BETWEEN 5 AND 4000
    THEN RAISE EXCEPTION 'Event text is incomplete or too long'; END IF;
  FOREACH k IN ARRAY ARRAY['durationHours','target','minimum'] LOOP
    IF jsonb_typeof(d->k) IS DISTINCT FROM 'number' OR (d->>k)!~'^[0-9]+$' THEN RAISE EXCEPTION 'Invalid integer: %',k; END IF;
  END LOOP;
  IF (d->>'durationHours')::integer NOT BETWEEN 1 AND 2160 OR (d->>'target')::integer NOT BETWEEN 1 AND 100 OR (d->>'minimum')::integer NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Event limits are outside the allowed range'; END IF;
  IF jsonb_typeof(d->'actions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Actions must be an array'; END IF;
  IF jsonb_array_length(d->'actions') NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Provide 1 to 12 actions'; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(d->'actions') LOOP
    FOREACH k IN ARRAY ARRAY['id','name','kind','description'] LOOP
      IF jsonb_typeof(a->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid action text'; END IF;
    END LOOP;
    IF length(a->>'id') NOT BETWEEN 1 AND 100 OR a->>'id'=ANY(ids) OR length(trim(a->>'name')) NOT BETWEEN 3 AND 100 OR length(a->>'description')>2000 OR a->>'kind' NOT IN ('aid','main') THEN RAISE EXCEPTION 'Invalid action identity'; END IF;
    ids:=array_append(ids,a->>'id');
    FOREACH k IN ARRAY ARRAY['hours','adjustment','threshold','reduction'] LOOP
      IF jsonb_typeof(a->k) IS DISTINCT FROM 'number' OR (a->>k)!~'^-?[0-9]+$' THEN RAISE EXCEPTION 'Invalid action integer'; END IF;
    END LOOP;
    IF (a->>'hours')::integer NOT BETWEEN 1 AND LEAST(168,(d->>'durationHours')::integer)
      OR (a->>'adjustment')::integer NOT BETWEEN -10 AND 10 OR (a->>'threshold')::integer NOT BETWEEN 1 AND 10000
      OR (a->>'reduction')::integer NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid action limits'; END IF;
    IF jsonb_typeof(a->'skills') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Skills must be an array'; END IF;
    IF jsonb_array_length(a->'skills') NOT BETWEEN 1 AND 18
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(a->'skills') s WHERE jsonb_typeof(s) IS DISTINCT FROM 'string')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(a->'skills') s WHERE NOT s=ANY(allowed)) THEN RAISE EXCEPTION 'Invalid permitted checks'; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM jsonb_array_elements(d->'actions') AS entry(value) WHERE entry.value->>'kind'='main';
  IF n=0 THEN RAISE EXCEPTION 'Include a main action'; END IF;
END $$;

CREATE FUNCTION public.wm_start(p_event uuid,p_slot integer,p_actor text,p_reason text,p_automatic boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.wm_events; s public.wm_slots;
BEGIN
  SELECT * INTO STRICT e FROM public.wm_events WHERE id=p_event;
  SELECT * INTO STRICT s FROM public.wm_slots WHERE id=p_slot;
  IF e.status<>'queued' OR s.event_id IS NOT NULL OR e.definition->>'kind'<>s.kind THEN RAISE EXCEPTION 'Event or slot is no longer available'; END IF;
  UPDATE public.wm_events SET status='active',starts_at=now(),ends_at=now()+make_interval(hours=>(e.definition->>'durationHours')::integer),revision=revision+1 WHERE id=p_event;
  UPDATE public.wm_slots SET event_id=p_event,cooldown_until=NULL WHERE id=p_slot;
  PERFORM public.wm_log_action(p_actor,CASE WHEN p_automatic THEN 'automatic_start' ELSE 'manual_start' END,p_event,p_reason,jsonb_build_object('slotId',p_slot,'previousCooldown',s.cooldown_until));
END $$;

CREATE FUNCTION public.wm_cancel(p_event uuid,p_actor text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.wm_events;
BEGIN
  SELECT * INTO STRICT e FROM public.wm_events WHERE id=p_event;
  IF e.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Event is already closed'; END IF;
  UPDATE public.wm_events SET status='cancelled',outcome='cancelled',revision=revision+1 WHERE id=p_event;
  UPDATE public.wm_contributions SET status='void' WHERE event_id=p_event AND status='pending';
  UPDATE public.wm_slots SET event_id=NULL,cooldown_until=now()+interval '24 hours' WHERE event_id=p_event;
  PERFORM public.wm_log_action(p_actor,'remove',p_event,p_reason,jsonb_build_object('previousStatus',e.status));
END $$;

-- Internal worker. Caller must hold the shared transaction advisory lock.
CREATE FUNCTION public.wm_process() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.wm_contributions; e public.wm_events; s public.wm_slots; a jsonb; reduction integer; good bigint; total_checks bigint; next_event uuid; result text;
BEGIN
  FOR c IN SELECT x.* FROM public.wm_contributions x JOIN public.wm_events ev ON ev.id=x.event_id
    WHERE x.status='pending' AND x.ends_at<=now() AND ev.status='active'
    ORDER BY x.ends_at,CASE WHEN x.kind='aid' THEN 0 ELSE 1 END,x.id LOOP
    reduction:=0;
    IF c.kind='main' THEN SELECT COALESCE(sum(m.reduction),0)::integer INTO reduction FROM public.wm_milestones m WHERE m.event_id=c.event_id AND m.unlocked_at<=c.ends_at; END IF;
    UPDATE public.wm_contributions SET status='completed',final_dc=c.base_dc-reduction,success=(c.total>=c.base_dc-reduction) WHERE id=c.id;
    IF c.kind='aid' AND c.total>=c.base_dc THEN
      SELECT count(*) INTO good FROM public.wm_contributions WHERE event_id=c.event_id AND action_id=c.action_id AND status='completed' AND success;
      IF good>=(c.action_snapshot->>'threshold')::integer THEN
        INSERT INTO public.wm_milestones(event_id,action_id,reduction,unlocked_at) VALUES(c.event_id,c.action_id,(c.action_snapshot->>'reduction')::integer,c.ends_at) ON CONFLICT DO NOTHING;
        IF FOUND THEN PERFORM public.wm_log_action(NULL,'aid_unlocked',c.event_id,'',jsonb_build_object('actionId',c.action_id,'logicalTime',c.ends_at)); END IF;
      END IF;
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM public.wm_events WHERE status='active' AND ends_at<=now() ORDER BY ends_at,id LOOP
    SELECT count(*),count(*) FILTER(WHERE success) INTO total_checks,good FROM public.wm_contributions WHERE event_id=e.id AND kind='main' AND status='completed';
    result:=CASE WHEN total_checks<(e.definition->>'minimum')::integer THEN 'insufficient' WHEN good*100>=total_checks*(e.definition->>'target')::integer THEN 'success' ELSE 'failure' END;
    UPDATE public.wm_events SET status='completed',outcome=result,revision=revision+1 WHERE id=e.id;
    UPDATE public.wm_slots SET event_id=NULL,cooldown_until=e.ends_at+interval '24 hours' WHERE event_id=e.id;
    PERFORM public.wm_log_action(NULL,'completed',e.id,result,jsonb_build_object('successes',good,'total',total_checks,'logicalTime',e.ends_at));
  END LOOP;
  FOR s IN SELECT * FROM public.wm_slots WHERE kind='minor' AND event_id IS NULL AND (cooldown_until IS NULL OR cooldown_until<=now()) ORDER BY id LOOP
    SELECT id INTO next_event FROM public.wm_events WHERE status='queued' AND definition->>'kind'='minor' ORDER BY approved_at,id LIMIT 1;
    IF next_event IS NOT NULL THEN PERFORM public.wm_start(next_event,s.id,NULL,'Approval-order queue',true); END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.wm_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(17092026,1);
  PERFORM public.wm_process();
END $$;

CREATE FUNCTION public.wm_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid text:=auth.uid()::text; admin boolean; staff boolean;
BEGIN
  SELECT is_admin INTO admin FROM public.users WHERE auth_user_id=uid AND NOT is_banned;
  IF admin IS NULL THEN RAISE EXCEPTION 'Sign in with an eligible account' USING ERRCODE='42501'; END IF;
  staff:=admin OR EXISTS(SELECT 1 FROM public.wm_staff WHERE user_id=uid);
  RETURN jsonb_build_object('userId',uid,'isAdmin',admin,'isStaff',staff,
    'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'authorId',e.author_id,'authorName',u.username,'definition',e.definition,'status',e.status,'revision',e.revision,'createdAt',e.created_at,'approvedAt',e.approved_at,'startsAt',e.starts_at,'endsAt',e.ends_at,'outcome',e.outcome,'reviewNote',CASE WHEN staff OR e.author_id=uid THEN e.review_note ELSE '' END) ORDER BY e.created_at DESC) FROM public.wm_events e JOIN public.users u ON u.auth_user_id=e.author_id WHERE staff OR e.author_id=uid OR e.status IN ('queued','active','paused','completed') OR (e.status='cancelled' AND e.approved_at IS NOT NULL)),'[]'::jsonb),
    'characters',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'ancestry',COALESCE(c.ancestry,c.race,''),'heritage',COALESCE(c.heritage,''),'classPrimary',COALESCE(c.class_primary,c.class,''),'classSecondary',COALESCE(c.class_secondary,''),'level',c.level,'status',c.character_status) ORDER BY c.name) FROM public.characters c WHERE c.user_id=uid),'[]'::jsonb),
    'contributions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'eventId',c.event_id,'characterId',c.character_id,'playerId',c.player_id,'playerName',(SELECT username FROM public.users WHERE auth_user_id=c.player_id),'characterName',c.character_name,'level',c.level,'actionId',c.action_id,'kind',c.kind,'skill',c.skill,'modifier',c.modifier,'description',c.description,'die',c.die,'total',c.total,'baseDc',c.base_dc,'finalDc',c.final_dc,'success',c.success,'startsAt',c.starts_at,'endsAt',c.ends_at,'status',c.status) ORDER BY c.ends_at DESC) FROM public.wm_contributions c),'[]'::jsonb),
    'slots',(SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'eventId',event_id,'cooldownUntil',cooldown_until) ORDER BY id) FROM public.wm_slots),
    'applications',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'userId',a.user_id,'username',u.username,'motivation',a.motivation,'experience',a.experience,'availability',a.availability,'status',a.status,'createdAt',a.created_at,'note',a.note) ORDER BY a.created_at DESC) FROM public.wm_applications a JOIN public.users u ON u.auth_user_id=a.user_id WHERE admin OR a.user_id=uid),'[]'::jsonb),
    'logs',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'actorName',l.actor_name,'action',l.action,'eventId',l.event_id,'reason',l.reason,'details',l.details,'createdAt',l.created_at) ORDER BY l.created_at DESC,l.id) FROM public.wm_log l WHERE staff AND (admin OR l.action NOT IN ('staff_approved','staff_declined','staff_revoked','reward_redeemed'))),'[]'::jsonb),
    'rewards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'eventId',r.event_id,'authorId',r.author_id,'code',r.code,'status',r.status,'createdAt',r.created_at)) FROM public.wm_rewards r WHERE admin OR r.author_id=uid),'[]'::jsonb),
    'staff',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',s.user_id,'username',u.username)) FROM public.wm_staff s JOIN public.users u ON u.auth_user_id=s.user_id WHERE admin),'[]'::jsonb),
    'awards','[]'::jsonb);
END $$;

CREATE FUNCTION public.wm_command(p_request_id uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid text:=auth.uid()::text; admin boolean; staff boolean; op text:=p_command->>'type'; previous jsonb;
  e public.wm_events; s public.wm_slots; ch public.characters; app public.wm_applications; data jsonb; d jsonb; a jsonb; b jsonb;
  event_id uuid; char_id uuid; selected uuid; reason text:=COALESCE(p_command->>'reason',''); action text;
  start_time timestamptz; end_time timestamptz; modifier integer; die integer; byte integer; base integer; level_dcs integer[]:=ARRAY[14,15,16,18,19,20,22,23,24,26,27,28,30,31,32,34,35,36,38,39,40];
BEGIN
  PERFORM pg_advisory_xact_lock(17092026,1);
  SELECT is_admin INTO admin FROM public.users WHERE auth_user_id=uid AND NOT is_banned;
  IF admin IS NULL THEN RAISE EXCEPTION 'Sign in with an eligible account' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR octet_length(p_command::text)>100000 THEN RAISE EXCEPTION 'Invalid command'; END IF;
  staff:=admin OR EXISTS(SELECT 1 FROM public.wm_staff WHERE user_id=uid);
  SELECT command INTO previous FROM public.wm_requests WHERE user_id=uid AND request_id=p_request_id;
  IF FOUND THEN
    IF previous<>p_command THEN RAISE EXCEPTION 'Request ID already belongs to a different command'; END IF;
    RETURN public.wm_snapshot();
  END IF;
  IF (SELECT count(*) FROM public.wm_requests WHERE user_id=uid AND created_at>now()-interval '1 minute')>=120 THEN
    RAISE EXCEPTION 'Too many requests; please wait a minute';
  END IF;
  PERFORM set_config('app.wm_request_id',p_request_id::text,true);
  -- Finalize already-due work before any cancellation or pause can affect it.
  PERFORM public.wm_process();
  IF length(reason)>2000 THEN RAISE EXCEPTION 'Reason is too long'; END IF;
  IF op='save_character' THEN
    data:=p_command->'character';
    IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR COALESCE(length(trim(data->>'name')),0) NOT BETWEEN 2 AND 100 OR COALESCE(length(trim(data->>'ancestry')),0) NOT BETWEEN 1 AND 100 OR COALESCE(length(trim(data->>'classPrimary')),0) NOT BETWEEN 1 AND 100 OR length(COALESCE(data->>'heritage',''))>100 OR length(COALESCE(data->>'classSecondary',''))>100 OR COALESCE(data->>'level','')!~'^[0-9]+$' THEN RAISE EXCEPTION 'Character details are incomplete'; END IF;
    IF (data->>'level')::integer NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Level must be 1 to 20'; END IF;
    char_id:=NULLIF(data->>'id','')::uuid;
    IF char_id IS NULL THEN
      INSERT INTO public.characters(user_id,name,class,class_primary,class_secondary,race,ancestry,heritage,level)
      VALUES(uid,trim(data->>'name'),trim(data->>'classPrimary'),trim(data->>'classPrimary'),COALESCE(data->>'classSecondary',''),trim(data->>'ancestry'),trim(data->>'ancestry'),COALESCE(data->>'heritage',''),(data->>'level')::integer);
    ELSE
      UPDATE public.characters SET name=trim(data->>'name'),class=trim(data->>'classPrimary'),class_primary=trim(data->>'classPrimary'),class_secondary=COALESCE(data->>'classSecondary',''),race=trim(data->>'ancestry'),ancestry=trim(data->>'ancestry'),heritage=COALESCE(data->>'heritage',''),level=(data->>'level')::integer,updated_at=now() WHERE id=char_id AND user_id=uid AND character_status='active';
      IF NOT FOUND THEN RAISE EXCEPTION 'Active character not found'; END IF;
    END IF;
  ELSIF op='archive_character' THEN
    UPDATE public.characters SET character_status='retired',is_active=false,updated_at=now() WHERE id=(p_command->>'id')::uuid AND user_id=uid AND character_status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Active character not found'; END IF;
  ELSIF op='save_event' THEN
    d:=p_command->'definition'; PERFORM public.wm_validate_definition(d);
    event_id:=NULLIF(p_command->>'id','')::uuid;
    IF event_id IS NULL THEN
      INSERT INTO public.wm_events(author_id,definition,status) VALUES(uid,d,CASE WHEN COALESCE((p_command->>'submit')::boolean,false) THEN 'submitted' ELSE 'draft' END) RETURNING id INTO event_id;
    ELSE
      SELECT * INTO STRICT e FROM public.wm_events WHERE id=event_id;
      IF e.author_id<>uid OR e.status NOT IN ('draft','returned','rejected') THEN RAISE EXCEPTION 'This event cannot be edited'; END IF;
      IF (p_command->>'revision')::integer IS DISTINCT FROM e.revision THEN RAISE EXCEPTION 'Event changed; refresh before editing'; END IF;
      UPDATE public.wm_events SET definition=d,status=CASE WHEN COALESCE((p_command->>'submit')::boolean,false) THEN 'submitted' ELSE 'draft' END,revision=revision+1 WHERE id=event_id;
    END IF;
    PERFORM public.wm_log_action(uid,CASE WHEN COALESCE((p_command->>'submit')::boolean,false) THEN 'submitted' ELSE 'draft_saved' END,event_id);
  ELSIF op='review_event' THEN
    IF NOT staff THEN RAISE EXCEPTION 'Event Staff required' USING ERRCODE='42501'; END IF;
    SELECT * INTO STRICT e FROM public.wm_events WHERE id=(p_command->>'id')::uuid;
    IF e.author_id=uid THEN RAISE EXCEPTION 'Another reviewer must review your event'; END IF;
    IF e.status<>'submitted' OR (p_command->>'revision')::integer IS DISTINCT FROM e.revision THEN RAISE EXCEPTION 'Submission changed; refresh before reviewing'; END IF;
    action:=p_command->>'decision';
    IF action NOT IN ('approve','return','reject') OR action IS NULL THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
    IF action<>'approve' AND length(trim(reason))<3 THEN RAISE EXCEPTION 'Explain the review decision'; END IF;
    UPDATE public.wm_events SET status=CASE action WHEN 'approve' THEN 'queued' WHEN 'return' THEN 'returned' ELSE 'rejected' END,approved_at=CASE WHEN action='approve' THEN now() ELSE NULL END,review_note=reason,revision=revision+1 WHERE id=e.id;
    IF action='approve' THEN INSERT INTO public.wm_rewards(event_id,author_id) VALUES(e.id,e.author_id) ON CONFLICT ON CONSTRAINT wm_rewards_event_id_key DO NOTHING; END IF;
    PERFORM public.wm_log_action(uid,'review_'||action,e.id,reason,jsonb_build_object('reviewedRevision',e.revision));
  ELSIF op='apply_staff' THEN
    IF staff THEN RAISE EXCEPTION 'You already have Event Staff access'; END IF;
    IF COALESCE(length(trim(p_command->>'motivation')),0) NOT BETWEEN 20 AND 4000 OR COALESCE(length(trim(p_command->>'experience')),0) NOT BETWEEN 2 AND 4000 OR COALESCE(length(trim(p_command->>'availability')),0) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'Complete all application fields'; END IF;
    INSERT INTO public.wm_applications(user_id,motivation,experience,availability) VALUES(uid,p_command->>'motivation',p_command->>'experience',p_command->>'availability');
  ELSIF op='review_staff' THEN
    IF NOT admin THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
    SELECT * INTO STRICT app FROM public.wm_applications WHERE id=(p_command->>'id')::uuid AND status='pending';
    IF jsonb_typeof(p_command->'approve') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid application decision'; END IF;
    UPDATE public.wm_applications SET status=CASE WHEN (p_command->>'approve')::boolean THEN 'approved' ELSE 'declined' END,note=reason WHERE id=app.id;
    IF (p_command->>'approve')::boolean THEN INSERT INTO public.wm_staff(user_id) VALUES(app.user_id) ON CONFLICT DO NOTHING; END IF;
    PERFORM public.wm_log_action(uid,CASE WHEN (p_command->>'approve')::boolean THEN 'staff_approved' ELSE 'staff_declined' END,NULL,reason,jsonb_build_object('userId',app.user_id,'applicationId',app.id));
  ELSIF op='revoke_staff' THEN
    IF NOT admin THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
    IF length(trim(reason))<3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
    DELETE FROM public.wm_staff WHERE user_id=p_command->>'userId';
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found'; END IF;
    PERFORM public.wm_log_action(uid,'staff_revoked',NULL,reason,jsonb_build_object('userId',p_command->>'userId'));
  ELSIF op='control_event' THEN
    IF NOT staff THEN RAISE EXCEPTION 'Event Staff required' USING ERRCODE='42501'; END IF;
    IF length(trim(reason))<3 THEN RAISE EXCEPTION 'Explain this intervention'; END IF;
    action:=p_command->>'operation'; event_id:=NULLIF(p_command->>'id','')::uuid;
    IF event_id IS NOT NULL THEN
      SELECT * INTO STRICT e FROM public.wm_events WHERE id=event_id;
      IF (p_command->>'revision')::integer IS DISTINCT FROM e.revision THEN RAISE EXCEPTION 'Event changed; refresh controls'; END IF;
    END IF;
    IF action IN ('pause','resume') THEN
      IF event_id IS NULL OR e.status<>(CASE WHEN action='pause' THEN 'active' ELSE 'paused' END) THEN RAISE EXCEPTION 'Invalid event state'; END IF;
      UPDATE public.wm_events SET status=CASE WHEN action='pause' THEN 'paused' ELSE 'active' END,revision=revision+1 WHERE id=e.id;
      PERFORM public.wm_log_action(uid,action,e.id,reason);
    ELSIF action='remove' THEN
      IF event_id IS NULL THEN RAISE EXCEPTION 'Select an event'; END IF;
      PERFORM public.wm_cancel(e.id,uid,reason);
    ELSIF action IN ('start','fire','replace') THEN
      SELECT * INTO STRICT s FROM public.wm_slots WHERE id=(p_command->>'slotId')::integer;
      IF action='replace' THEN
        IF s.event_id IS NULL OR event_id IS DISTINCT FROM s.event_id THEN RAISE EXCEPTION 'Slot changed; refresh controls'; END IF;
        selected:=(p_command->>'replacementId')::uuid;
        IF selected IS NULL THEN RAISE EXCEPTION 'Select a replacement'; END IF;
        PERFORM public.wm_cancel(s.event_id,uid,reason);
        PERFORM public.wm_log_action(uid,'replace',s.event_id,reason,jsonb_build_object('slotId',s.id,'replacementId',selected));
      ELSE
        IF s.event_id IS NOT NULL THEN RAISE EXCEPTION 'Slot is occupied'; END IF;
        selected:=COALESCE(NULLIF(p_command->>'replacementId','')::uuid,event_id);
        IF selected IS NULL AND s.kind='minor' THEN SELECT id INTO selected FROM public.wm_events WHERE status='queued' AND definition->>'kind'='minor' ORDER BY approved_at,id LIMIT 1; END IF;
        IF selected IS NULL THEN RAISE EXCEPTION 'Select an approved event'; END IF;
        IF action='start' AND s.cooldown_until>now() THEN RAISE EXCEPTION 'Slot is cooling down; use explicit fire override'; END IF;
        IF action='fire' THEN PERFORM public.wm_log_action(uid,'cooldown_override',selected,reason,jsonb_build_object('slotId',s.id)); END IF;
      END IF;
      PERFORM public.wm_start(selected,s.id,uid,reason,false);
    ELSE RAISE EXCEPTION 'Unknown event operation'; END IF;
  ELSIF op='book' THEN
    IF jsonb_typeof(p_command->'bookings') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Provide a schedule'; END IF;
    IF jsonb_array_length(p_command->'bookings') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Book between 1 and 50 actions at once'; END IF;
    FOR b IN SELECT value FROM jsonb_array_elements(p_command->'bookings') LOOP
      SELECT * INTO STRICT ch FROM public.characters WHERE id=(b->>'characterId')::uuid AND user_id=uid AND character_status='active' FOR UPDATE;
      IF ch.level NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Character level must be 1 to 20'; END IF;
      SELECT * INTO STRICT e FROM public.wm_events WHERE id=(b->>'eventId')::uuid AND status='active';
      SELECT value INTO a FROM jsonb_array_elements(e.definition->'actions') WHERE value->>'id'=b->>'actionId';
      IF a IS NULL OR NOT (a->'skills' ? (b->>'skill')) THEN RAISE EXCEPTION 'Select an allowed check'; END IF;
      IF COALESCE(b->>'modifier','')!~'^-?[0-9]+$' OR COALESCE(length(trim(b->>'description')),0) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Provide an integer modifier and an action description'; END IF;
      modifier:=(b->>'modifier')::integer;
      IF modifier NOT BETWEEN -20 AND 100 THEN RAISE EXCEPTION 'Modifier must be between -20 and 100'; END IF;
      start_time:=(b->>'startsAt')::timestamptz;
      end_time:=start_time+make_interval(hours=>(a->>'hours')::integer);
      IF start_time IS NULL OR start_time<now() OR start_time>now()+interval '7 days' OR start_time<e.starts_at OR end_time>e.ends_at THEN RAISE EXCEPTION 'Work must start in the next seven days and finish before the event deadline'; END IF;
      IF EXISTS(SELECT 1 FROM public.wm_contributions WHERE character_id=ch.id AND status<>'void' AND starts_at<end_time AND ends_at>start_time) THEN RAISE EXCEPTION 'This character already has work during that time'; END IF;
      -- Rejection sampling of a UUID's first random byte: 0..239 is divisible by 20.
      LOOP byte:=get_byte(uuid_send(gen_random_uuid()),0); EXIT WHEN byte<240; END LOOP;
      die:=byte%20+1; base:=level_dcs[ch.level+1]+(a->>'adjustment')::integer;
      INSERT INTO public.wm_contributions(event_id,character_id,player_id,character_name,level,action_id,action_snapshot,kind,skill,modifier,description,die,total,base_dc,starts_at,ends_at)
      VALUES(e.id,ch.id,uid,ch.name,ch.level,a->>'id',a,a->>'kind',b->>'skill',modifier,trim(b->>'description'),die,die+modifier,base,start_time,end_time);
    END LOOP;
  ELSIF op='redeem_reward' THEN
    IF NOT admin THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
    IF length(trim(reason))<3 THEN RAISE EXCEPTION 'Include the external award reference'; END IF;
    UPDATE public.wm_rewards SET status='redeemed',redeemed_at=now(),redeemed_by=uid WHERE id=(p_command->>'id')::uuid AND status='issued' RETURNING wm_rewards.event_id INTO event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reward is unavailable or already redeemed'; END IF;
    PERFORM public.wm_log_action(uid,'reward_redeemed',event_id,reason);
  ELSE RAISE EXCEPTION 'Unknown Westmarch command'; END IF;
  INSERT INTO public.wm_requests(user_id,request_id,command) VALUES(uid,p_request_id,p_command);
  PERFORM public.wm_process();
  RETURN public.wm_snapshot();
END $$;

REVOKE ALL ON FUNCTION public.wm_log_action(text,text,uuid,text,jsonb),public.wm_validate_definition(jsonb),public.wm_start(uuid,integer,text,text,boolean),public.wm_cancel(uuid,text,text),public.wm_process(),public.wm_tick(),public.wm_snapshot(),public.wm_command(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_snapshot(),public.wm_command(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_tick() TO service_role;
-- Deployment must schedule wm_tick() once per minute using pg_cron or a protected
-- service-role worker. No privileged key belongs in the browser. Commands also
-- catch up due work; reads deliberately never mutate canonical state.
NOTIFY pgrst,'reload schema';

