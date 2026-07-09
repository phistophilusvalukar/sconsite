DO $$
DECLARE
  table_name text;
  realtime_tables text[] := ARRAY[
    'users',
    'wall_posts',
    'friendships',
    'characters',
    'guilds',
    'guild_memberships',
    'guild_applications',
    'schedule_polls',
    'schedule_participants',
    'schedule_availability',
    'games',
    'game_invites',
    'game_applications',
    'game_archive_comments',
    'game_archive_likes',
    'character_foundry_files',
    'character_journal_entries',
    'character_journal_comments',
    'character_journal_likes',
    'character_relationships',
    'news_posts',
    'news_comments',
    'news_likes'
  ];
BEGIN
  FOREACH table_name IN ARRAY realtime_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
