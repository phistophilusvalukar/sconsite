-- Allow site administrators to review their own events for testing.
-- Event Staff still require a different reviewer. Existing grants are preserved.
CREATE OR REPLACE FUNCTION public.wm_command(p_request_id uuid,p_command jsonb) RETURNS jsonb
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
    IF e.author_id=uid AND NOT admin THEN RAISE EXCEPTION 'Another reviewer must review your event'; END IF;
    IF e.status<>'submitted' OR (p_command->>'revision')::integer IS DISTINCT FROM e.revision THEN RAISE EXCEPTION 'Submission changed; refresh before reviewing'; END IF;
    action:=p_command->>'decision';
    IF action NOT IN ('approve','return','reject') OR action IS NULL THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
    IF action<>'approve' AND length(trim(reason))<3 THEN RAISE EXCEPTION 'Explain the review decision'; END IF;
    UPDATE public.wm_events SET status=CASE action WHEN 'approve' THEN 'queued' WHEN 'return' THEN 'returned' ELSE 'rejected' END,approved_at=CASE WHEN action='approve' THEN now() ELSE NULL END,review_note=reason,revision=revision+1 WHERE id=e.id;
    IF action='approve' THEN INSERT INTO public.wm_rewards(event_id,author_id) VALUES(e.id,e.author_id) ON CONFLICT ON CONSTRAINT wm_rewards_event_id_key DO NOTHING; END IF;
    PERFORM public.wm_log_action(uid,'review_'||action,e.id,reason,jsonb_build_object('reviewedRevision',e.revision,'selfReview',e.author_id=uid));
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
