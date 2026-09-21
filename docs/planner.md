# GRID shared planner

The independent `/planner` route reuses the site's Discord/Supabase login and database. It has its own layout and no Westmarch data dependencies. The main navigation links to it under Tools.

## Installation

Apply `supabase/migrations/20260921000200_shared_planner.sql` through the project's normal Supabase migration process before deploying the frontend. The migration adds only `planner_*` tables and functions. It requires the existing Supabase `auth.users`, `auth.uid()`, `anon`, and `authenticated` roles. No new environment variables or assets are needed. The UI displays an explicit setup message if the RPCs are missing.

## Behavior

- Spaces are private or shared at creation. Owners receive a random invite code for shared spaces. Members can edit all lists/tasks and complete or undo items. Owners can rotate the invite code, remove members, and delete the space. Members can leave. Removing a member does not invalidate a code they already know; rotate the code to prevent rejoining.
- Lists have individually checkable items. Tasks can be one-off, daily, weekly, or monthly. Completion belongs to a task/date pair and is shared across members.
- The calendar supports Monday-first day/week/month views. Scheduling uses date-only values, with no times, timezone conversion, notifications, or recurrence end dates. A monthly task anchored to the 31st occurs on the last day of shorter months and returns to the 31st where available.
- Task names and schedules are editable. Schedules with completed occurrences are protected; undo completions or create a new task to change the schedule. Deleting a task or space removes its completion history after confirmation.
- Members see changes on the next automatic refresh (every 15 seconds while visible), on window focus, or using the refresh control. Saves return an authoritative snapshot immediately. This first version uses polling, not a public broadcast channel.
- Day/night and accent preferences persist in the current browser. Accent selection includes a color wheel, keyboard-accessible sliders, and a native color input. The rest of the interface uses neutral colors.

## Security and validation

Tables have RLS enabled and no direct anonymous/authenticated grants. The only callable APIs are authenticated security-definer `planner_snapshot()` and `planner_command(uuid,jsonb)`, with fixed search paths. All reads explicitly filter membership; every space command locks and checks membership. Invite codes are returned only to owners. Account metadata exposes display names only, not emails or other metadata.

Commands validate ownership and parent relationships. Database constraints enforce valid titles, dates, and recurrence. Server-side recurrence validation rejects completion of nonexistent occurrences. Request IDs deduplicate retries and reject reuse for different commands. Zod validates client commands and server snapshots. Commands are serialized per user and per space; request rates are limited to 120/minute per user.

The planner deliberately does not depend on campaign characters, guilds, or Westmarch membership. The site's existing account-ban screen still applies at the app shell level.

## Verification

`npx vitest run src/features/planner` exercises date edge cases and executes the migration in PostgreSQL-compatible PGlite. Tests cover private-space isolation, forbidden direct table writes, invite rotation/revocation, cross-space attacks, shared checklists, independent recurring completions, history protection, request deduplication, and agreement between SQL and TypeScript recurrence rules.

The full repository test suite, production build, migration version validation, and ESLint were run. Existing app/workspace typecheck failures remain in unrelated character/game code, WebXR types, and `packages/rules/src/dungeonRelay.ts`. No planner type errors were reported. Browser interaction/layout checks used disposable local fixture data; live Discord and Supabase deployment are not part of that fixture verification.
