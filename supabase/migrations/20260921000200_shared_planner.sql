-- Independent planner; auth.users is the only connection to the existing site.
CREATE TABLE public.planner_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared boolean NOT NULL DEFAULT false,
  invite_code uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (shared = (invite_code IS NOT NULL))
);
CREATE TABLE public.planner_members (
  space_id uuid NOT NULL REFERENCES public.planner_spaces ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  PRIMARY KEY (space_id,user_id)
);
CREATE INDEX planner_members_user ON public.planner_members(user_id);
CREATE TABLE public.planner_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.planner_spaces ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planner_lists_space ON public.planner_lists(space_id);
CREATE TABLE public.planner_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.planner_lists ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planner_items_list ON public.planner_items(list_id);
CREATE TABLE public.planner_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.planner_spaces ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  starts_on date NOT NULL CHECK (starts_on BETWEEN date '1900-01-01' AND date '9999-12-31'),
  recurrence text NOT NULL CHECK (recurrence IN ('once','daily','weekly','monthly')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planner_tasks_space ON public.planner_tasks(space_id);
CREATE TABLE public.planner_completions (
  task_id uuid NOT NULL REFERENCES public.planner_tasks ON DELETE CASCADE,
  occurs_on date NOT NULL,
  completed_by uuid REFERENCES auth.users ON DELETE SET NULL,
  PRIMARY KEY (task_id,occurs_on)
);
CREATE TABLE public.planner_requests (
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  request_id uuid NOT NULL,
  command jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,request_id)
);

ALTER TABLE public.planner_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planner_spaces,public.planner_members,public.planner_lists,public.planner_items,public.planner_tasks,public.planner_completions,public.planner_requests FROM anon,authenticated;

CREATE FUNCTION public.planner_occurs(starts date, recurrence text, occurrence date) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT occurrence >= starts AND CASE recurrence
    WHEN 'once' THEN occurrence=starts
    WHEN 'daily' THEN true
    WHEN 'weekly' THEN (occurrence-starts)%7=0
    WHEN 'monthly' THEN extract(day FROM occurrence)=least(extract(day FROM starts),extract(day FROM (date_trunc('month',occurrence)+interval '1 month - 1 day')))
    ELSE false END
$$;

CREATE FUNCTION public.planner_snapshot() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to use the planner' USING ERRCODE='42501'; END IF;
  WITH spaces AS (SELECT s.* FROM planner_spaces s JOIN planner_members m ON m.space_id=s.id WHERE m.user_id=uid),
    lists AS (SELECT l.* FROM planner_lists l JOIN spaces s ON s.id=l.space_id),
    tasks AS (SELECT t.* FROM planner_tasks t JOIN spaces s ON s.id=t.space_id)
  SELECT jsonb_build_object(
    'spaces',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'owner_id',owner_id,'shared',shared,'invite_code',CASE WHEN owner_id=uid THEN invite_code ELSE NULL END) ORDER BY created_at,id) FROM spaces),'[]'::jsonb),
    'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('space_id',m.space_id,'user_id',m.user_id,'name',COALESCE(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','Member'))) FROM planner_members m JOIN spaces s ON s.id=m.space_id JOIN auth.users u ON u.id=m.user_id),'[]'::jsonb),
    'lists',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'space_id',space_id,'title',title) ORDER BY created_at,id) FROM lists),'[]'::jsonb),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'list_id',i.list_id,'title',i.title,'done',i.done) ORDER BY i.created_at,i.id) FROM planner_items i JOIN lists l ON l.id=i.list_id),'[]'::jsonb),
    'tasks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'space_id',space_id,'title',title,'starts_on',starts_on,'recurrence',recurrence) ORDER BY created_at,id) FROM tasks),'[]'::jsonb),
    'completions',COALESCE((SELECT jsonb_agg(jsonb_build_object('task_id',c.task_id,'occurs_on',c.occurs_on)) FROM planner_completions c JOIN tasks t ON t.id=c.task_id),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.planner_command(p_request_id uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); op text:=p_command->>'type'; sid uuid; target uuid;
  space public.planner_spaces; task public.planner_tasks; previous jsonb; occurrence date;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to use the planner' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR octet_length(p_command::text)>4096 THEN RAISE EXCEPTION 'Invalid command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,21092026));
  SELECT command INTO previous FROM planner_requests WHERE user_id=uid AND request_id=p_request_id;
  IF FOUND THEN
    IF previous<>p_command THEN RAISE EXCEPTION 'Request ID belongs to a different command'; END IF;
    RETURN planner_snapshot();
  END IF;
  IF (SELECT count(*) FROM planner_requests WHERE user_id=uid AND created_at>now()-interval '1 minute')>=120 THEN RAISE EXCEPTION 'Too many requests; wait a minute'; END IF;
  IF op='create_space' THEN
    IF jsonb_typeof(p_command->'shared') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Choose private or shared'; END IF;
    INSERT INTO planner_spaces(name,owner_id,shared,invite_code) VALUES(trim(p_command->>'name'),uid,(p_command->>'shared')::boolean,CASE WHEN (p_command->>'shared')::boolean THEN gen_random_uuid() END) RETURNING id INTO sid;
    INSERT INTO planner_members VALUES(sid,uid);
  ELSIF op='join' THEN
    SELECT * INTO space FROM planner_spaces WHERE invite_code=(p_command->>'code')::uuid AND shared FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invite code is invalid or has been replaced'; END IF;
    INSERT INTO planner_members VALUES(space.id,uid) ON CONFLICT DO NOTHING;
  ELSE
    sid:=(p_command->>'spaceId')::uuid;
    SELECT * INTO space FROM planner_spaces WHERE id=sid FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM planner_members WHERE space_id=sid AND user_id=uid) THEN RAISE EXCEPTION 'Space unavailable' USING ERRCODE='42501'; END IF;
    target:=(p_command->>'id')::uuid;
    IF op='rotate_invite' THEN
      IF space.owner_id<>uid OR NOT space.shared THEN RAISE EXCEPTION 'Only the shared space owner can replace invites'; END IF;
      UPDATE planner_spaces SET invite_code=gen_random_uuid() WHERE id=sid;
    ELSIF op='remove_member' THEN
      IF (p_command->>'userId')::uuid=space.owner_id THEN RAISE EXCEPTION 'The owner cannot leave their space'; END IF;
      IF space.owner_id<>uid AND (p_command->>'userId')::uuid<>uid THEN RAISE EXCEPTION 'Only the owner can remove other members'; END IF;
      DELETE FROM planner_members WHERE space_id=sid AND user_id=(p_command->>'userId')::uuid;
    ELSIF op='delete_space' THEN
      IF space.owner_id<>uid THEN RAISE EXCEPTION 'Only the owner can delete this space'; END IF;
      DELETE FROM planner_spaces WHERE id=sid;
    ELSIF op='create_list' THEN
      INSERT INTO planner_lists(space_id,title) VALUES(sid,trim(p_command->>'title'));
    ELSIF op='delete_list' THEN
      DELETE FROM planner_lists WHERE id=target AND space_id=sid;
      IF NOT FOUND THEN RAISE EXCEPTION 'List unavailable'; END IF;
    ELSIF op='add_item' THEN
      IF NOT EXISTS(SELECT 1 FROM planner_lists WHERE id=(p_command->>'listId')::uuid AND space_id=sid) THEN RAISE EXCEPTION 'List unavailable'; END IF;
      INSERT INTO planner_items(list_id,title) VALUES((p_command->>'listId')::uuid,trim(p_command->>'title'));
    ELSIF op IN ('check_item','delete_item') THEN
      IF NOT EXISTS(SELECT 1 FROM planner_items i JOIN planner_lists l ON l.id=i.list_id WHERE i.id=target AND l.space_id=sid) THEN RAISE EXCEPTION 'Item unavailable'; END IF;
      IF op='delete_item' THEN DELETE FROM planner_items WHERE id=target;
      ELSE
        IF jsonb_typeof(p_command->'done') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid completion'; END IF;
        UPDATE planner_items SET done=(p_command->>'done')::boolean WHERE id=target;
      END IF;
    ELSIF op='save_task' THEN
      IF target IS NULL THEN
        INSERT INTO planner_tasks(space_id,title,starts_on,recurrence) VALUES(sid,trim(p_command->>'title'),(p_command->>'startsOn')::date,p_command->>'recurrence');
      ELSE
        SELECT * INTO task FROM planner_tasks WHERE id=target AND space_id=sid;
        IF NOT FOUND THEN RAISE EXCEPTION 'Task unavailable'; END IF;
        -- Completed occurrences keep their history; only title changes are allowed after completion.
        IF (task.starts_on<>(p_command->>'startsOn')::date OR task.recurrence<>p_command->>'recurrence') AND EXISTS(SELECT 1 FROM planner_completions WHERE task_id=target) THEN RAISE EXCEPTION 'Undo completions before changing the schedule, or create a new task'; END IF;
        UPDATE planner_tasks SET title=trim(p_command->>'title'),starts_on=(p_command->>'startsOn')::date,recurrence=p_command->>'recurrence' WHERE id=target;
      END IF;
    ELSIF op IN ('delete_task','check_task') THEN
      SELECT * INTO task FROM planner_tasks WHERE id=target AND space_id=sid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Task unavailable'; END IF;
      IF op='delete_task' THEN DELETE FROM planner_tasks WHERE id=target;
      ELSE
        occurrence:=(p_command->>'date')::date;
        IF occurrence IS NULL OR NOT planner_occurs(task.starts_on,task.recurrence,occurrence) THEN RAISE EXCEPTION 'Task does not occur on this date'; END IF;
        IF jsonb_typeof(p_command->'done') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid completion'; END IF;
        IF (p_command->>'done')::boolean THEN
          INSERT INTO planner_completions VALUES(target,occurrence,uid) ON CONFLICT DO NOTHING;
        ELSE DELETE FROM planner_completions WHERE task_id=target AND occurs_on=occurrence; END IF;
      END IF;
    ELSE RAISE EXCEPTION 'Unknown planner command'; END IF;
  END IF;
  INSERT INTO planner_requests(user_id,request_id,command) VALUES(uid,p_request_id,p_command);
  RETURN planner_snapshot();
END $$;
REVOKE ALL ON FUNCTION public.planner_occurs(date,text,date),public.planner_snapshot(),public.planner_command(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.planner_snapshot(),public.planner_command(uuid,jsonb) TO authenticated;
