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
