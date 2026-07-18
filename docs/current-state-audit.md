# Current-state audit

## Snapshot

The repository is a working single-package React 18/Vite 5/TypeScript site using npm, Tailwind, React Router, Supabase Auth/Postgres/realtime, Vercel, and GitHub Actions. The root application has established community routes and a substantial migration history. There was no test runner, game engine, Colyseus server, Phaser dependency, monorepo workspace, or card-game code at audit time.

## Constraints and conflicts

- Moving the existing site into `apps/web` immediately would disrupt Vercel configuration, imports, CI, and deployment history.
- `package-lock.json` and npm scripts are established; a pnpm conversion adds risk without game value.
- Existing Supabase tables/types must be extended, not replaced.
- Existing `/games` is a community listing route, so the card game uses `/cards`, `/decks`, `/play`, and `/match/:id`.

## Migration decision

Keep the web app at repository root for the vertical slice. Add npm workspaces for `packages/*` and `apps/match-server`, with root aliases into packages. A later, separately tested move to `apps/web` is optional. Existing pages, auth, migrations, and deployment remain intact.

## Existing validation

The baseline commands are `npm run lint` and `npm run build`; new work adds `test` and `typecheck`. Environment currently expects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
