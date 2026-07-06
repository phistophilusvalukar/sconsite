# Deployment

This project deploys through GitHub Actions to Vercel and pushes Supabase migrations on production updates.

## Supabase

1. Create a Supabase project.
2. Enable Google Auth in Authentication > Providers.
3. Add callback URLs:

```text
http://localhost:5173/auth/callback
https://your-vercel-domain.vercel.app/auth/callback
```

4. Get your project ref from the Supabase dashboard URL.
5. Create a Supabase access token from your account settings.
6. Keep the database password available for CI.

## Vercel

1. Create/import the Vercel project.
2. Add these Vercel environment variables for Production and Preview:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

3. Make sure the build command is `npm run build` and the output directory is `dist`.

## GitHub Secrets

Add these under GitHub repository Settings > Secrets and variables > Actions:

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

## Workflow

- Pull requests: install, lint, build, deploy Vercel preview.
- Push to `main`: install, lint, build, push Supabase migrations, deploy Vercel production.

The workflow file is `.github/workflows/deploy-vercel.yml`.
