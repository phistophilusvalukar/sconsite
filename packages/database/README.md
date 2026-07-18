# Game database

Apply `supabase/migrations/20260718000100_fantasy_card_game.sql` with `supabase db reset` locally or `supabase db push` to a linked project. Generate complete types with `supabase gen types typescript --local > packages/database/src/generated.ts`.

Browser clients use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Only the match server may use `SUPABASE_SERVICE_ROLE_KEY`; never prefix it with `VITE_` or send it to clients. The match server appends immutable event rows and writes match results. Players can read their own decks, collection, settings, ratings, and matches, but cannot write authoritative match records.
