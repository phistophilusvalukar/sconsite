# Westmarch implementation checkpoint

Started 2026-09-17. Full specification: `docs/westmarch-events-plan.md`.

## Working-tree safety

Unrelated escape-room / lockpicking work was already present at the start. Do not revert, stage, or overwrite it. Westmarch work is additive under `src/features/westmarch`, a new migration, documentation, and small route/middleware changes.

## Work in progress

- Root: typed contract, standalone shell, player pages, service integration, checkpoint documentation.
- Backend agent: authoritative migration and server commands.
- Staff UI agent: submissions, staff applications, controls, audit log.
- Rules/testing agent: deterministic projection helpers, rule tests, executable database integration tests.

## Conservative first-release choices

- Simple total versus level-based DC, with no special natural 1/20 outcomes, until scoring policy is explicitly changed.
- No invented monetary/reputation amounts. Creator approval codes track approval; actual reward policy must be configured before payouts.
- One day occupies 24 hours; action durations use whole hours; starts can be booked up to seven days ahead.
- Pauses hold processing and new bookings without moving character calendars.
- Staff cannot approve their own event or grant themselves staff access.

## Deployment boundary

No production migration, scheduler, or deployment has been run. Complete checks and inspect migration before enabling real users. Resume from the existing working tree rather than regenerating files.

This file will be updated with verification and remaining work before the checkpoint closes.
