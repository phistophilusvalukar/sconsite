# Westmarch implementation checkpoint

Started 2026-09-17. Full specification: `docs/westmarch-events-plan.md`.

## Working-tree safety

Unrelated escape-room / lockpicking work was already present at the start. Do not revert, stage, or overwrite it. Westmarch work is additive under `src/features/westmarch`, a new migration, documentation, and small route/middleware changes.

## Checkpoint 2 — integration, 2026-09-21

Resumed from the user's clean commit `2e65b23`. One agent only; this checkpoint deliberately stops before deployment, reward policy work, or a new feature phase.

Completed:

- Connected all existing screens under `/westmarch/*` without main-site navigation. Middleware passes these paths to the shared Discord session gate; similarly named paths remain protected.
- Added the standalone responsive forest/gold design, reusable page/form/card/calendar styling, inline explanations and confirmation styling, loading/error/saved states, and a one-minute refresh fallback.
- Connected the existing Supabase snapshot/command service. Command retries retain their request ID in memory/session storage to avoid duplicate committed rolls after a lost response.
- Reused character profile pages behind an owned-character guard; the mini management form continues using actual registry records.
- Repaired three interrupted SQL defects: unparenthesized CASE in a PL/pgSQL IF condition, ambiguous action alias, and ambiguous reward conflict target. The actual migration now executes in PGlite and all six server-flow tests pass.
- Fixed the Westmarch ES2020 `replaceAll` error, moved shared date formatting into a utility, and retained server audit details in the parsed snapshot.

Verification:

- Focused Westmarch plus middleware tests: 40 passed.
- Full `npm test`: 388 passed across root and workspaces.
- `npm run build`: passes; existing large-chunk warning remains.
- Full lint had only two Westmarch warnings; fixed both, then targeted lint is clean.
- Migration validation: 114 unique versions; `git diff --check` passes.
- Workspace `npm run typecheck` remains blocked by existing Three.js DOM type errors. Explicit application typecheck has 33 existing errors elsewhere (character data typing, other feature `replaceAll` uses, etc.); no Westmarch or App.tsx diagnostics.
- Browser checked the real signed-out `/westmarch` page on desktop and at 390px width. No horizontal overflow; no main navigation. Authenticated screens have styling but have NOT yet had an end-to-end browser pass against a deployed staging database.

## Next bounded checkpoint

Perform authenticated staging/fixture integration and visual QA only. Do not silently expand into all remaining feature work. Reuse the existing tests and components.

Priority checks:

1. Apply the migration against the full existing schema in staging, including real character lifecycle triggers, then run author/reviewer/player workflows. PGlite tests currently provide a minimal prior-schema fixture, not the entire migration history.
2. Exercise character create/edit/retire, event submission, staff application/review/revocation, manual controls, batch scheduling, and refresh/retry through the browser; inspect desktop/mobile layout for populated boards and forms.
3. Align existing client/backend validation bounds (UI modifier −10..60 versus server −20..100) and finish audit-detail presentation. Current logs show actor/action/reason, but additional stored target/replacement metadata is not displayed yet.
4. Verify pauses/removals near completion deadlines and worker-only operation; deploy the minute worker only after staging validation.

Later separate checkpoints: reward policy and real reputation ledger/Fame rankings; normalized region catalog; active-character eligibility; pagination/Realtime invalidation; broader lifecycle/concurrency coverage. Draft plans are currently component state, not a saved weekly planner. Foundry enrichment uses existing profile functionality. No reputation amounts have been invented.

## Conservative first-release choices

- Simple total versus level-based DC, with no special natural 1/20 outcomes, until scoring policy is explicitly changed.
- No invented monetary/reputation amounts. Creator approval codes track approval; actual reward policy must be configured before payouts.
- One day occupies 24 hours; action durations use whole hours; starts can be booked up to seven days ahead.
- Pauses hold processing and new bookings without moving character calendars.
- Staff cannot approve their own event or grant themselves staff access.

## Deployment boundary

No production migration, scheduler, or deployment has been run. Complete checks and inspect migration before enabling real users. Resume from the existing working tree rather than regenerating files.

The checkpoint is recorded on disk. New changes are left uncommitted for user review.
