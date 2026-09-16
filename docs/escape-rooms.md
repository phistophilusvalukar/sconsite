# Escape Rooms companion

Open **Tools → Escape Rooms** (`/escape-rooms`). Members sign in using the site's existing authentication. Site administrators can author and host; players join a shared room using its invitation code.

## Setup

Apply `supabase/migrations/20260916000100_escape_rooms.sql` through the project's normal migration workflow before deploying the client. The migration uses the existing `is_site_admin`, `is_user_banned`, and Supabase Auth helpers. It adds four tables and protected RPCs. If `supabase_realtime` exists, it publishes only `escape_updates`, whose rows contain a session ID and revision number.

Do not add `escape_sessions` or `escape_blueprints` to Realtime. They hold private answers, unrevealed handouts, and GM notes. Clients have no direct read/write privileges on those tables. The player RPC snapshot explicitly projects only revealed node fields; it excludes solutions, dependencies, private notes, the full definition, and the invite code.

## Build and run an adventure

1. Choose **Blank blueprint** or **New from starter**. The Astronomer's Last Secret demonstrates two parallel branches converging at a vault.
2. Set the adventure title and player introduction. Select discoveries on the map to edit them, or add new ones.
3. Define each discovery's type, physical prop, location, handout, reverse/inside text, and private GM notes.
4. Select prerequisite discoveries and whether each must be **known** or **used / solved**. Choose **ALL** to join parallel branches or **ANY** for alternative routes. The map includes required-item edges as dashed lines. Cycles and missing references block saving.
5. Choose a manual GM reveal or an automatic reveal when the prerequisites are satisfied. Automatic nodes without prerequisites appear when the room starts. Manual nodes can be revealed by the GM at any time, including as an override.
6. Containers, rooms, puzzles, and treasures can require an answer and/or selected item nodes. Answers ignore letter case and outer spaces but preserve internal spacing and leading zeroes. Both answer and items are required when configured together. Blank requirements permit a simple open/claim action.
7. Save the blueprint and **Launch room**. Each launch takes an independent, immutable copy of the design. Editing a blueprint affects future launches only. Share the invitation code privately with the party.
8. Use **Puzzle master** to follow the color-coded map and reveal Foundry discoveries. **Player view** previews the party's shared stash. The GM can pause/resume or mark a known clue used/solve a lock as an override.

All treasure nodes must be claimed to complete a session. Use a single final treasure for alternative paths to one ending. All nodes remain inspectable after completion. Launch a fresh room to replay; active sessions do not reset or silently adopt blueprint changes.

## Handouts and physical objects

Players can orbit and zoom the selected object in a real WebGL scene, or use keyboard-accessible rotate/zoom/reset buttons. Paper and book props have generated front and reverse textures. The complete handout is also available as selectable text. The viewer renders on demand rather than running a continuous animation loop, limits rendering pixel density, and loads separately from the main feature. Text mode persists on the device and does not load the 3D module. A WebGL failure leaves the text handout available.

Reverse/inside text is inspectable immediately after the containing discovery is revealed. To make invisible ink, a cipher solution, or a hidden page conditional on another discovery, create a **separate clue node** with prerequisites and manual/automatic reveal. Do not put still-secret text on the back of an already revealed handout.

Keys and rods are item nodes. Players select discovered items when trying a lock. Successful use marks the required items used, but keeps them in the stash for reuse. Known means discovered; used means explicitly marked by the GM, applied to a lock, or solved/opened. Reading a clue alone does not mark it used.

The props and starter text are original project assets, recorded in `src/features/escape-rooms/assets.json`. This release uses procedural props, not uploaded model files, images, or PDFs.

## Multiplayer and security

- `escape_save_blueprint`: authenticated site admin, owner-only edits, revision checked.
- `escape_start_session`: authenticated site admin, owns blueprint.
- `escape_join_session`: signed-in, non-banned player with the unguessable invitation code; repeat joins are idempotent.
- `escape_snapshot`: GM or joined member only; player-safe projection.
- `escape_command`: GM reveal/mark-used/pause/resume or member unlock. Locks the session row, checks expected revision, validates answers and inventory, applies changes atomically, and returns the authoritative snapshot.
- `escape_library`: only the caller's blueprints and accessible sessions.

Realtime notices trigger a fresh protected snapshot. A focus refresh and 15-second reconciliation interval recover from missed notices. Membership count means **joined players**, not a presence indicator. Failed attempts do not change progress or expose answers in the shared activity log. Stale actions are rejected and the client refreshes before the player retries.

The GM invitation grants ongoing membership to anyone signed in who receives it; share it only with intended players. This version has no member removal or invitation rotation UI. GM controls require the session owner to retain site-admin status. No unauthenticated room access is supported.

## Future Foundry integration

The Foundry module is not included. Stable blueprint node IDs are shown in the maker and preserved by JSON export/import. A future module can map Foundry journal, item, or scene IDs to these node IDs and request the same `reveal` command. Authenticate as the owning GM (or add a narrowly scoped integration credential behind a protected server API); never embed the Supabase service-role key in Foundry or allow player clients to publish canonical state. Fetch the current revision before submitting; handle stale revisions by reloading and retrying deliberately. A reveal already applied is rejected instead of duplicated.

## Verification

`npx vitest run src/features/escape-rooms` runs authoring tests and the actual SQL migration/commands in a disposable PGlite PostgreSQL instance. The database tests use an authenticated database role and cover private snapshots, RLS, denied direct writes, GM/player permissions, branch traversal, code/item validation, stale revisions, pause/resume, completion, and blueprint validation. They do not connect to Supabase or change live data.

Before live use, smoke-test with a GM and two signed-in player accounts in separate browsers: join one room, reveal a clue, verify both players update, solve each branch, apply both vault items, reconnect a player, and claim the treasure. Check that a non-member cannot fetch snapshots or revision notices and a player's network payload contains no GM notes or hidden nodes.

Local checks: lint, full tests, production build, and migration-version validation pass. Workspace/application typechecks have existing errors outside the escape-room feature, including `packages/rules/src/dungeonRelay.ts` and character/profile-related types. The 3D viewer produces Vite's advisory chunk-size warning and is lazy loaded. Live Supabase Realtime delivery and a deployed multi-account session require the migration and have not been verified by the local SQL tests.
