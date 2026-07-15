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
  GUILD_APPLICATIONS: 'guild_applications',
  SCHEDULE_POLLS: 'schedule_polls',
  SCHEDULE_PARTICIPANTS: 'schedule_participants',
  SCHEDULE_AVAILABILITY: 'schedule_availability',
  GAMES: 'games',
  GAME_INVITES: 'game_invites',
  GAME_APPLICATIONS: 'game_applications',
  GAME_ARCHIVE_COMMENTS: 'game_archive_comments',
  GAME_ARCHIVE_LIKES: 'game_archive_likes',
  CHARACTER_FOUNDRY_FILES: 'character_foundry_files',
  CHARACTER_JOURNAL_ENTRIES: 'character_journal_entries',
  CHARACTER_JOURNAL_COMMENTS: 'character_journal_comments',
  CHARACTER_JOURNAL_LIKES: 'character_journal_likes',
  CHARACTER_RELATIONSHIPS: 'character_relationships',
  NEWS_POSTS: 'news_posts',
  NEWS_COMMENTS: 'news_comments',
  NEWS_LIKES: 'news_likes',
  LOCK_CHALLENGES: 'lock_challenges',
  PERFORMANCE_CHALLENGES: 'performance_challenges',
  PERFORMANCE_ATTEMPTS: 'performance_attempts',
};
