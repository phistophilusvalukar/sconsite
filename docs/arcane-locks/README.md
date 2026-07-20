# Arcane Lock Multiplayer Game

## Overview

The arcane lock feature is a standalone multiplayer React/Supabase game. Players read permitted inscriptions, rotate SVG ring locks, power glyphs, and invoke a lock when the semantic chain and conduit route are correct. FoundryVTT is treated only as a future access provider for proximity and visibility; it does not own puzzle state.

## Local Setup

Required environment variables are the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Edge Functions also require `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `FOUNDRY_ALLOWED_ORIGIN`, `FOUNDRY_CONNECTED_SECONDS`, and `FOUNDRY_DELAYED_SECONDS`.

Run migrations with your normal Supabase workflow, then start the app:

```bash
npm run dev
```

Open `/arcane-locks`. If the new RPCs are not deployed yet, the page uses a local demo session so UI and engine work can be tested.

## Architecture

Pure puzzle logic lives in `src/features/arcane-locks/engine`. React renders, sends actions, and listens for Realtime changes. Supabase tables and RPCs are the canonical authority for sessions, members, lock instances, lock state, permissions, action history, reset generations, and Foundry provider values.

The instruction boundary is `get_arcane_lock_view_for_current_user`. It returns public geometry and current state to members, but only returns the real inscription and hint when effective read access is true or the caller is the GM.

## Puzzle Definitions

Puzzle definitions are data-driven TypeScript templates in `src/features/arcane-locks/data/puzzleTemplates.ts`. A definition includes glyph dictionary entries, rings, conduits, obstacles, solution rules, initial state, and conduit reveal mode.

Add glyphs in `src/features/arcane-locks/data/glyphs.ts` with a stable id, label, SVG path, semantic tags, and accessible description. Add new templates by composing rings and a `solutionRules` chain.

The engine supports several advanced routing patterns:

- Independent required chains, such as `Grass -> Cow` and `Moon -> Ocean`, by adding multiple `solutionRules`.
- Ring skips and outward/backtracking routes with `destinationRingId`.
- Duplicate glyphs on one ring with `glyphSockets`, `sourceSocketId`, and socket ids in `solutionRules`.
- Branching power by assigning multiple conduits to the same source glyph or source socket.
- Blocker-required branches by combining branching conduits with obstacle `blocks`; blocked invalid branches do not invalidate a solved chain, while unblocked invalid branches do.

Older templates that only use `glyphIds` still work. Use `glyphSockets` when two visually identical glyphs need different conduit paths.

`Eclipse Labyrinth` is the expert template that intentionally exercises these primitives together. It uses independent chains, duplicate Moon sockets, skip routing, a return route, and a blocked false branch from Grass.

## GM Flow

The migration supports session statuses: `draft`, `active`, `paused`, `completed`, and `archived`. GMs can manage membership, status, access provider mode, per-player lock access, reset one lock, and reset all locks through RPCs. The UI includes the first GM panel surface and uses the same access resolver as players.

## Player Flow

Players must be accepted session members. Spectators can view allowed state but cannot manipulate locks. Movement denial keeps the lock visible but blocks actions and displays a reason. Instruction denial returns redacted text instead of plaintext.

Players choose one of their active characters before making Arcana knowledge checks. The first check binds that character to the current lock generation. Puzzle DC is `14 + (difficulty * 2)`, using the character's imported Arcana modifier. Checks use Pathfinder-style degrees of success: totals ten above/below the DC shift the degree, and natural 20/1 improve or reduce it one step.

Each player gets one translation check. A critical success reveals the whole inscription, a success reveals intermittent words, and a failure or critical failure reveals none. Each player also gets three glyph checks; critical success, success, failure, and critical failure reveal 5, 3, 2, and 1 previously unknown glyphs respectively. Results are stored per player, lock, and reset generation. Resetting a lock gives players a fresh knowledge record for the new generation.

## Realtime

The client subscribes to `arcane-session:{sessionId}` and refreshes canonical state when sessions, lock instances, or access rows change. Clients re-fetch after rejected actions rather than replaying missed events.

## Security Model

RLS is enabled on all new tables. Direct lock state updates are limited to GMs by policy, while normal player action writes go through `perform_lock_action`. Effective permissions are centralized in `arcane_effective_lock_access`.

`perform_lock_action` checks membership, status, role, movement permission, generation, expected version, and duplicate action id before updating state and action history. The RPC normalizes rotations, validates glyph/ring/socket legality, applies linked-ring motion, traces conduits, records failed invokes, and only marks a lock solved when the required semantic chains and physical conduit routes are valid.

## Foundry Contract

Future Foundry modules call:

```text
POST /functions/v1/foundry-access-events
POST /functions/v1/foundry-heartbeat
```

Requests use `Authorization: Bearer <installation secret>`. The server stores only `sha256(secret)` in `foundry_world_links.hashed_installation_secret`. The module must never receive a Supabase service role key.

Access events are batched by `eventId`, map Foundry users through `foundry_user_links`, verify lock bindings through `foundry_lock_bindings`, and update only provider fields on `arcane_lock_player_access`. They never overwrite `interact_override` or `read_override`, and they never alter lock runtime state.

Heartbeat status is interpreted as connected within 30 seconds, delayed from 30 to 90 seconds, and disconnected after 90 seconds unless overridden by environment variables.

## Simulator

Use the development simulator against a deployed Edge Function:

```bash
FOUNDRY_ACCESS_ENDPOINT=https://PROJECT.functions.supabase.co/foundry-access-events \
FOUNDRY_INSTALLATION_SECRET=... \
FOUNDRY_INSTALLATION_ID=... \
FOUNDRY_WORLD_EXTERNAL_ID=world-1 \
ARCANE_SESSION_ID=... \
ARCANE_LOCK_ID=... \
FOUNDRY_SCENE_EXTERNAL_ID=scene-1 \
FOUNDRY_USER_EXTERNAL_ID=user-1 \
node scripts/simulate-foundry-access.mjs
```

## Testing

Run:

```bash
npm run test
npm run build
```

Core coverage includes ring rotation, slot mapping, conduit destinations, energy tracing, linked rings, permanent wards, duplicate sockets, branching routes, reset behavior, solution validation, permission override resolution, spectator denial, GM permission, and concurrency rejection cases.

## Known Limitations

The current UI exposes a complete playable demo surface and contracts, but lock-authoring controls, tab reordering, richer user search states, and deployed database/RLS integration tests are still pending. The SQL validation path now supports the current advanced routing primitives; future obstacle types such as mirrors, splitters, filters, and amplifiers will need matching server-side rules before those mechanics are exposed to players.
