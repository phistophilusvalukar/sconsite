import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    persistSession: true,
    storageKey: 'sconsite-supabase-auth',
  },
});

export const DATABASE_TABLES = {
  USERS: 'users',
  WALL_POSTS: 'wall_posts',
  FRIENDSHIPS: 'friendships',
  CHARACTERS: 'characters',
  GUILDS: 'guilds',
  GUILD_MEMBERSHIPS: 'guild_memberships',
  SCHEDULE_POLLS: 'schedule_polls',
  SCHEDULE_PARTICIPANTS: 'schedule_participants',
  SCHEDULE_AVAILABILITY: 'schedule_availability',
};
