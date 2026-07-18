-- Fantasy card game persistence. Authoritative writes use the server service role.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists card_sets (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  released_at date, source_metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists card_definitions (
  id uuid primary key default gen_random_uuid(), stable_key text not null, version integer not null check(version>0), set_id uuid not null references card_sets(id),
  name text not null, card_type text not null check(card_type in ('font','creature','spell','aura','magic_item','consumable')),
  definition jsonb not null, source_metadata jsonb not null default '{}'::jsonb, published boolean not null default false, created_at timestamptz not null default now(), unique(stable_key,version)
);
create table if not exists player_collections (
  player_id uuid not null references profiles(id) on delete cascade, card_definition_id uuid not null references card_definitions(id), quantity integer not null default 0 check(quantity>=0), updated_at timestamptz not null default now(), primary key(player_id,card_definition_id)
);
create table if not exists decks (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(id) on delete cascade, name text not null check(char_length(name) between 1 and 80),
  format text not null default 'prototype', version integer not null default 1 check(version>0), is_valid boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists deck_cards (
  deck_id uuid not null references decks(id) on delete cascade, card_definition_id uuid not null references card_definitions(id), card_version integer not null check(card_version>0),
  quantity integer not null check(quantity between 1 and 99), created_at timestamptz not null default now(), primary key(deck_id,card_definition_id,card_version)
);
create table if not exists matchmaking_tickets (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references profiles(id) on delete cascade, deck_id uuid not null references decks(id),
  status text not null default 'queued' check(status in ('queued','matched','cancelled','expired')), queue text not null default 'standard', rating integer not null default 1000,
  expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists one_active_matchmaking_ticket on matchmaking_tickets(player_id) where status='queued';
create table if not exists matches (
  id uuid primary key default gen_random_uuid(), status text not null default 'waiting' check(status in ('waiting','active','complete','abandoned')),
  rules_version text not null, random_seed text not null, initial_snapshot jsonb not null, final_snapshot jsonb, started_at timestamptz, ended_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists match_players (
  match_id uuid not null references matches(id) on delete cascade, player_id uuid not null references profiles(id), seat smallint not null check(seat in (1,2)),
  deck_id uuid references decks(id) on delete set null, deck_version integer not null, deck_snapshot jsonb not null, joined_at timestamptz, disconnected_at timestamptz,
  primary key(match_id,player_id), unique(match_id,seat)
);
create table if not exists match_results (
  match_id uuid primary key references matches(id) on delete cascade, winner_id uuid references profiles(id), reason text not null,
  duration_seconds integer check(duration_seconds>=0), created_at timestamptz not null default now()
);
create table if not exists match_event_logs (
  id bigint generated always as identity primary key, match_id uuid not null references matches(id) on delete cascade, sequence integer not null check(sequence>0),
  command_id uuid not null, actor_id uuid references profiles(id), command jsonb not null, events jsonb not null, state_hash text, created_at timestamptz not null default now(),
  unique(match_id,sequence), unique(match_id,command_id)
);
create table if not exists player_ratings (
  player_id uuid not null references profiles(id) on delete cascade, queue text not null default 'standard', rating integer not null default 1000,
  games_played integer not null default 0 check(games_played>=0), updated_at timestamptz not null default now(), primary key(player_id,queue)
);
create table if not exists player_settings (
  player_id uuid primary key references profiles(id) on delete cascade, settings jsonb not null default '{"masterVolume":1,"musicVolume":0.7,"sfxVolume":0.8,"reducedMotion":false}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists decks_owner_updated_idx on decks(owner_id,updated_at desc);
create index if not exists card_definitions_set_type_idx on card_definitions(set_id,card_type);
create index if not exists matchmaking_queue_idx on matchmaking_tickets(queue,status,rating,created_at);
create index if not exists match_players_player_idx on match_players(player_id,match_id);
create index if not exists match_event_logs_match_sequence_idx on match_event_logs(match_id,sequence);

alter table profiles enable row level security; alter table card_sets enable row level security; alter table card_definitions enable row level security;
alter table player_collections enable row level security; alter table decks enable row level security; alter table deck_cards enable row level security;
alter table matchmaking_tickets enable row level security; alter table matches enable row level security; alter table match_players enable row level security;
alter table match_results enable row level security; alter table match_event_logs enable row level security; alter table player_ratings enable row level security; alter table player_settings enable row level security;

create or replace function public.is_match_participant(target_match_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.match_players where match_id=target_match_id and player_id=auth.uid()) $$;
revoke all on function public.is_match_participant(uuid) from public;
grant execute on function public.is_match_participant(uuid) to authenticated;

create policy "profiles readable authenticated" on profiles for select to authenticated using(true);
create policy "profiles insert own" on profiles for insert to authenticated with check(id=auth.uid());
create policy "profiles update own" on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "published sets readable" on card_sets for select to authenticated using(true);
create policy "published cards readable" on card_definitions for select to authenticated using(published);
create policy "collection read own" on player_collections for select to authenticated using(player_id=auth.uid());
create policy "decks read own" on decks for select to authenticated using(owner_id=auth.uid());
create policy "decks insert own" on decks for insert to authenticated with check(owner_id=auth.uid());
create policy "decks update own" on decks for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "decks delete own" on decks for delete to authenticated using(owner_id=auth.uid());
create policy "deck cards read own" on deck_cards for select to authenticated using(exists(select 1 from decks d where d.id=deck_id and d.owner_id=auth.uid()));
create policy "deck cards insert own" on deck_cards for insert to authenticated with check(exists(select 1 from decks d where d.id=deck_id and d.owner_id=auth.uid()));
create policy "deck cards update own" on deck_cards for update to authenticated using(exists(select 1 from decks d where d.id=deck_id and d.owner_id=auth.uid())) with check(exists(select 1 from decks d where d.id=deck_id and d.owner_id=auth.uid()));
create policy "deck cards delete own" on deck_cards for delete to authenticated using(exists(select 1 from decks d where d.id=deck_id and d.owner_id=auth.uid()));
create policy "tickets read own" on matchmaking_tickets for select to authenticated using(player_id=auth.uid());
create policy "tickets create own deck" on matchmaking_tickets for insert to authenticated with check(player_id=auth.uid() and exists(select 1 from decks d where d.id=deck_id and d.owner_id=auth.uid() and d.is_valid));
create policy "tickets cancel own" on matchmaking_tickets for update to authenticated using(player_id=auth.uid()) with check(player_id=auth.uid() and status in ('queued','cancelled'));
create policy "matches read participant" on matches for select to authenticated using(public.is_match_participant(id));
create policy "match players read participant" on match_players for select to authenticated using(public.is_match_participant(match_id));
create policy "results read participant" on match_results for select to authenticated using(public.is_match_participant(match_id));
create policy "events read participant" on match_event_logs for select to authenticated using(public.is_match_participant(match_id));
create policy "ratings read own" on player_ratings for select to authenticated using(player_id=auth.uid());
create policy "settings read own" on player_settings for select to authenticated using(player_id=auth.uid());
create policy "settings insert own" on player_settings for insert to authenticated with check(player_id=auth.uid());
create policy "settings update own" on player_settings for update to authenticated using(player_id=auth.uid()) with check(player_id=auth.uid());

-- No authenticated INSERT/UPDATE policies exist for collections, matches, participants, results, event logs, or ratings: service-role server only.
