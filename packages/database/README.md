# Game database

Apply `supabase/migrations/20260718000100_fantasy_card_game.sql` with `supabase db reset` locally or `supabase db push` to a linked project. Generate complete types with `supabase gen types typescript --local > packages/database/src/generated.ts`.

Browser clients use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Only protected Supabase server-side functions may use `SUPABASE_SERVICE_ROLE_KEY`; never prefix it with `VITE_` or send it to clients. Those functions append immutable event rows and write match results. Players can read their own decks, collection, settings, ratings, and matches, but cannot write authoritative match records.

## Realtime match transport

`SupabaseMatchTransport` subscribes to a private `match:<uuid>` channel, receives event-log inserts and only the connected player's snapshot rows, tracks reconnectable presence, and submits validated command envelopes to the `match-command` Edge Function. Deploy it with `supabase functions deploy match-command`; JWT verification must remain enabled (the default).

The Edge Function only authenticates and queues intentions through `submit_match_command`. A trusted authority worker must claim pending `match_commands` using service credentials, execute deterministic rules, and transactionally append `match_event_logs`, player-specific `match_snapshots`, and the command result. Browsers have no direct write policy for those authoritative tables. `SUPABASE_SERVICE_ROLE_KEY` belongs only in that trusted worker, never this browser transport.
