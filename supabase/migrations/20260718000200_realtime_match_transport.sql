-- Durable command inbox and player-specific snapshots for Supabase Realtime delivery.
create table public.match_commands (
  id uuid primary key, match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id), player_sequence integer not null check(player_sequence>0),
  expected_revision integer not null check(expected_revision>=0), command jsonb not null,
  status text not null default 'pending' check(status in ('pending','processing','accepted','rejected')),
  rejection_code text, claimed_at timestamptz, processed_at timestamptz, created_at timestamptz not null default now(),
  unique(match_id,player_id,player_sequence)
);
create index match_commands_pending_idx on public.match_commands(status,created_at) where status='pending';
create table public.match_snapshots (
  match_id uuid not null references public.matches(id) on delete cascade, revision integer not null check(revision>=0),
  player_id uuid not null references public.profiles(id), snapshot jsonb not null, created_at timestamptz not null default now(),
  primary key(match_id,revision,player_id)
);
create index match_snapshots_player_latest_idx on public.match_snapshots(match_id,player_id,revision desc);
alter table public.match_commands enable row level security;
alter table public.match_snapshots enable row level security;
create policy "players read own command receipts" on public.match_commands for select to authenticated using(player_id=auth.uid() and public.is_match_participant(match_id));
create policy "players read own private snapshots" on public.match_snapshots for select to authenticated using(player_id=auth.uid() and public.is_match_participant(match_id));
-- There are deliberately no client write policies. Writes occur through the validated RPC or service role authority.

create or replace function public.submit_match_command(command_id uuid,target_match_id uuid,player_sequence integer,expected_revision integer,command_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision integer; existing public.match_commands;
begin
  if auth.uid() is null or not public.is_match_participant(target_match_id) then raise exception 'not_match_participant' using errcode='42501'; end if;
  if player_sequence<1 or expected_revision<0 or jsonb_typeof(command_payload)<>'object' or octet_length(command_payload::text)>16384 then raise exception 'invalid_command'; end if;
  if not (command_payload ? 'type') or length(command_payload->>'type') not between 1 and 64 then raise exception 'invalid_command_type'; end if;
  select * into existing from public.match_commands where id=command_id;
  if found then
    if existing.player_id<>auth.uid() or existing.match_id<>target_match_id then raise exception 'command_id_conflict' using errcode='23505'; end if;
    return jsonb_build_object('commandId',existing.id,'status',existing.status,'rejectionCode',existing.rejection_code);
  end if;
  if (select count(*) from public.match_commands where player_id=auth.uid() and created_at>now()-interval '1 second')>=10 then raise exception 'rate_limited'; end if;
  select coalesce(max(sequence),0) into current_revision from public.match_event_logs where match_id=target_match_id;
  if expected_revision<>current_revision then raise exception 'stale_revision'; end if;
  if player_sequence<>(select coalesce(max(mc.player_sequence),0)+1 from public.match_commands mc where mc.match_id=target_match_id and mc.player_id=auth.uid()) then raise exception 'out_of_order'; end if;
  insert into public.match_commands(id,match_id,player_id,player_sequence,expected_revision,command) values(command_id,target_match_id,auth.uid(),player_sequence,expected_revision,command_payload);
  return jsonb_build_object('commandId',command_id,'status','pending');
end $$;
revoke all on function public.submit_match_command(uuid,uuid,integer,integer,jsonb) from public;
grant execute on function public.submit_match_command(uuid,uuid,integer,integer,jsonb) to authenticated;

alter publication supabase_realtime add table public.match_event_logs;
alter publication supabase_realtime add table public.match_snapshots;
-- Private channel authorization for presence/broadcast; database changes remain governed by table RLS.
create policy "participants receive private match channels" on realtime.messages for select to authenticated
using(realtime.topic() ~ '^match:[0-9a-f-]{36}$' and public.is_match_participant(split_part(realtime.topic(),':',2)::uuid));
create policy "participants send private match presence" on realtime.messages for insert to authenticated
with check(realtime.topic() ~ '^match:[0-9a-f-]{36}$' and extension in ('presence','broadcast') and public.is_match_participant(split_part(realtime.topic(),':',2)::uuid));
