/*
  # Initial Database Schema for Pathfinder Westmarch Server

  1. New Tables
    - `users` - User profiles with Discord integration
    - `friendships` - Friend relationships between users
    - `wall_posts` - Wall posts on user profiles
    - `characters` - Player characters
    - `guilds` - Player guilds/organizations
    - `guild_memberships` - Guild membership relationships

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Add policies for public read access where appropriate

  3. Features
    - Full-text search capabilities
    - Optimized indexes for performance
    - JSON fields for flexible settings and stats
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  username text NOT NULL,
  discriminator text,
  email text UNIQUE NOT NULL,
  avatar text,
  bio text DEFAULT '',
  join_date timestamptz DEFAULT now(),
  last_active timestamptz DEFAULT now(),
  is_online boolean DEFAULT false,
  settings jsonb DEFAULT '{
    "allowWallPosts": true,
    "showOnlineStatus": true,
    "profilePrivate": false,
    "notifications": {
      "guildAnnouncements": true,
      "friendRequests": true,
      "eventReminders": false
    }
  }'::jsonb,
  stats jsonb DEFAULT '{
    "totalSessions": 0,
    "totalAchievements": 0,
    "joinedGuilds": 0
  }'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create friendships table
CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id text NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  addressee_id text NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

-- Create wall_posts table
CREATE TABLE IF NOT EXISTS wall_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id text NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  target_user_id text NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  content text NOT NULL,
  likes text[] DEFAULT '{}',
  replies jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create characters table
CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  name text NOT NULL,
  class text NOT NULL,
  level integer DEFAULT 1,
  race text NOT NULL,
  background text,
  alignment text,
  stats jsonb DEFAULT '{}'::jsonb,
  equipment jsonb DEFAULT '[]'::jsonb,
  backstory text DEFAULT '',
  notes text DEFAULT '',
  is_active boolean DEFAULT true,
  guild_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create guilds table
CREATE TABLE IF NOT EXISTS guilds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text DEFAULT '',
  leader_id text NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  member_count integer DEFAULT 1,
  max_members integer DEFAULT 50,
  recruitment_status text DEFAULT 'open' CHECK (recruitment_status IN ('open', 'closed', 'invite_only')),
  requirements text DEFAULT '',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create guild_memberships table
CREATE TABLE IF NOT EXISTS guild_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(guild_id, user_id)
);

-- Add foreign key constraint for characters guild_id
ALTER TABLE characters ADD CONSTRAINT characters_guild_id_fkey 
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_users_is_online ON users(is_online);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

CREATE INDEX IF NOT EXISTS idx_wall_posts_target_user ON wall_posts(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wall_posts_author ON wall_posts(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_guild_id ON characters(guild_id);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
CREATE INDEX IF NOT EXISTS idx_characters_active ON characters(is_active);

CREATE INDEX IF NOT EXISTS idx_guilds_name ON guilds(name);
CREATE INDEX IF NOT EXISTS idx_guilds_leader ON guilds(leader_id);
CREATE INDEX IF NOT EXISTS idx_guilds_recruitment ON guilds(recruitment_status);

CREATE INDEX IF NOT EXISTS idx_guild_memberships_guild ON guild_memberships(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_memberships_user ON guild_memberships(user_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE wall_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_memberships ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read public profiles"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    settings->>'profilePrivate' != 'true' OR 
    discord_id = auth.jwt() ->> 'sub'
  );

CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (discord_id = auth.jwt() ->> 'sub')
  WITH CHECK (discord_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (discord_id = auth.jwt() ->> 'sub');

-- Friendships policies
CREATE POLICY "Users can read own friendships"
  ON friendships
  FOR SELECT
  TO authenticated
  USING (
    requester_id = auth.jwt() ->> 'sub' OR 
    addressee_id = auth.jwt() ->> 'sub'
  );

CREATE POLICY "Users can manage own friendship requests"
  ON friendships
  FOR ALL
  TO authenticated
  USING (
    requester_id = auth.jwt() ->> 'sub' OR 
    addressee_id = auth.jwt() ->> 'sub'
  )
  WITH CHECK (
    requester_id = auth.jwt() ->> 'sub' OR 
    addressee_id = auth.jwt() ->> 'sub'
  );

-- Wall posts policies
CREATE POLICY "Users can read wall posts on accessible profiles"
  ON wall_posts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE discord_id = target_user_id 
      AND (settings->>'profilePrivate' != 'true' OR discord_id = auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "Users can create wall posts on accessible profiles"
  ON wall_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.jwt() ->> 'sub' AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE discord_id = target_user_id 
      AND settings->>'allowWallPosts' = 'true'
      AND (settings->>'profilePrivate' != 'true' OR discord_id = auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "Users can update own wall posts"
  ON wall_posts
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.jwt() ->> 'sub')
  WITH CHECK (author_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own wall posts or posts on their wall"
  ON wall_posts
  FOR DELETE
  TO authenticated
  USING (
    author_id = auth.jwt() ->> 'sub' OR 
    target_user_id = auth.jwt() ->> 'sub'
  );

-- Characters policies
CREATE POLICY "Users can read own characters"
  ON characters
  FOR SELECT
  TO authenticated
  USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can manage own characters"
  ON characters
  FOR ALL
  TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

-- Guilds policies
CREATE POLICY "Users can read all guilds"
  ON guilds
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Guild leaders can update their guilds"
  ON guilds
  FOR UPDATE
  TO authenticated
  USING (leader_id = auth.jwt() ->> 'sub')
  WITH CHECK (leader_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can create guilds"
  ON guilds
  FOR INSERT
  TO authenticated
  WITH CHECK (leader_id = auth.jwt() ->> 'sub');

-- Guild memberships policies
CREATE POLICY "Users can read guild memberships"
  ON guild_memberships
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage own guild memberships"
  ON guild_memberships
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.jwt() ->> 'sub' OR
    EXISTS (
      SELECT 1 FROM guilds 
      WHERE id = guild_id 
      AND leader_id = auth.jwt() ->> 'sub'
    )
  )
  WITH CHECK (
    user_id = auth.jwt() ->> 'sub' OR
    EXISTS (
      SELECT 1 FROM guilds 
      WHERE id = guild_id 
      AND leader_id = auth.jwt() ->> 'sub'
    )
  );
