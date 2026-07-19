# Pathfinder 2e Westmarch Server

A React/Supabase community hub for Pathfinder 2e Westmarch campaigns. It supports Google sign-in through Supabase Auth, player profiles, character management, social walls, friends, and FoundryVTT JSON character imports.

## Stack

- React 18, TypeScript, Vite
- Tailwind CSS
- Supabase Auth, PostgreSQL, RLS
- Vercel deployment
- GitHub Actions for CI, migrations, and deploys

## Local Setup

1. Install dependencies:

```bash
npm ci
```

2. Copy the example environment file:

```bash
cp .env.example .env.local
```

3. Fill in your Supabase values:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. In Supabase, enable Google Auth and add redirect URLs:

```text
http://localhost:5173/auth/callback
https://your-vercel-domain.vercel.app/auth/callback
```

5. Start development:

```bash
npm run dev
```

## Arcana Frontiers

The card-game route is available at `/arcana`. It includes a deterministic local match against an AI opponent using the shared rules engine. Online matches submit authenticated commands through the `match-command` Supabase Edge Function and receive player-private snapshots and events through Supabase Realtime. See `packages/database/README.md` for the transport contract and apply the Supabase migrations before connecting online clients.

## Database Migrations

Migrations live in `supabase/migrations`. The project now uses Supabase Auth user IDs as the application user key via `users.auth_user_id`.

For local/manual migration work:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

## GitHub Actions Secrets

Add these repository secrets before relying on automatic deployments:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_REF
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

## Deployment Flow

Pull requests run lint/build and deploy a Vercel preview.

Pushes to `main` run lint/build, push Supabase migrations, build Vercel artifacts, and deploy production.

## UnderHaul Contracts Office

The first playable UnderHaul office-job game lives at `/underhaul/contracts`. It adds a data-driven Contracts Officer desk with three starter cases, structured document fields, evidence flags, visitor questions, autosave, comparison views, a handbook, completed-case archive, and a Supabase RPC submission path.

Every active case now ends with a binary ruling:

- Approve: UnderHaul may perform the submitted job under the listed terms.
- Deny: The submission contains a legal, factual, ownership, or safety problem that prevents authorization. The client may submit corrected paperwork later.

Evidence flags are the player's reasoning. Written amendments and required free-text justification are not part of scoring.

Setup and commands:

- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Migration: apply `supabase/migrations/20260715000200_underhaul_contracts.sql`, `supabase/migrations/20260715000300_underhaul_contracts_visibility.sql`, and `supabase/migrations/20260715000400_binary_contract_rulings.sql`.
- Development: `npm run dev`.
- Tests: `npm run test`.
- Lint: `npm run lint`.
- Production build: `npm run build`.

The migrations create public case/run/action/outcome tables, a private `private.contract_case_solutions` table with no client read policy, RLS policies for player-owned runs, and `public.submit_contract_case_v2(...)` for server-side binary ruling and evidence scoring.

Authoring another case:

1. Add a `ContractCase` entry in `src/features/contracts/data/contractCases.ts`.
2. Validate the shape with `contractCasesSchema`.
3. Add matching hidden solution rows to a new Supabase migration.
4. Specify one `correct_ruling` of `approve` or `deny`.
5. Classify evidence as required, supporting, critical, irrelevant, misleading, or optional discovery.
6. Keep clue scoring tied to stable `DocumentField.id` values.
7. Add any artwork prompts or final assets under `src/features/contracts/assets/` or Supabase Storage paths such as `underhaul/contracts/cases/{case-slug}/`.

Authoring example:

```json
{
  "correctRuling": "deny",
  "requiredEvidenceIds": [
    "request.search_floor",
    "employment.assigned_floor",
    "request.contents_ownership"
  ],
  "supportingEvidenceIds": [
    "property.satchel_owner",
    "property.personal_contents_owner"
  ],
  "criticalEvidenceIds": [],
  "irrelevantEvidenceIds": [
    "request.client_address"
  ]
}
```

Placeholders and limitations:

- The current office mark, document treatments, stamps, and visitor area are CSS/HTML placeholders.
- `ASSET_PROMPTS.md` contains prompts for final office background, guild mark, document decorations, portraits, and seal diagram.
- Dragging is represented by keyboard nudge controls and desk positioning in this first slice; pointer dragging can be added without changing case data.
- Local demo submission exists for unsigned/offline development. Authenticated production submission should use `submit_contract_case_v2` after migrations are applied.
- Completed legacy local reports are rendered through a compatibility path. Incomplete legacy runs preserve investigation progress but clear obsolete pending final decisions.
