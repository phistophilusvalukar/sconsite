-- Isolated test bootstrap only; never apply to a deployed database.
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;
CREATE TABLE public.users(auth_user_id text PRIMARY KEY,username text,avatar text);
CREATE TABLE public.multiplayer_teams(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),leader_id text);
CREATE TABLE public.multiplayer_team_members(team_id uuid,user_id text,joined_at timestamptz DEFAULT now());
CREATE TABLE public.multiplayer_lobby_players(user_id text PRIMARY KEY,color text,mode text,team_id uuid,last_seen_at timestamptz,updated_at timestamptz);
CREATE TABLE public.multiplayer_team_invitations(team_id uuid,invitee_id text,status text,responded_at timestamptz);
