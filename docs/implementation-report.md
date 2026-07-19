# Arcana Frontiers implementation report

## 2026-07-18 playable-milestone update

`/arcana` is now driven by `packages/rules` rather than page-local counters. A player can select either validated prototype deck, start a seeded match against a deterministic AI, commit one hand card per turn as a Font, cast with automatic Font payment, choose spell targets, choose combat blockers, keep persistent Auras in support, inspect authoritative events, and copy the command/event replay log.

Live match delivery is being consolidated on Supabase Realtime with protected server-side command processing, player-private snapshots, sequencing, and reconnect support. The local rules-driven match remains available while the online browser workflow is completed.

New `packages/protocol` contracts validate commands, matchmaking, reconnect, snapshots, events, acknowledgements and errors, including hidden-information projection. New `packages/ui` supplies accessible reusable cards, mana/deck displays, modal, match inspector/log and state components.

The presentation milestone now includes browser-unlocked procedural sound cues for UI, Fonts, mana, cards, summoning, attacks, damage, attachments, errors, and results. Event-driven CSS sequences animate channeling, summoning, attack lunges, and impacts; both the explicit reduced-motion setting and the operating-system preference suppress them. Cards in the encyclopedia, hand, and battlefield open an accessible enlarged inspector with complete rules, cost, stats, traditions, traits, keywords, attribution, license, and placeholder-art disclosure.

## Outcome

This run preserves the existing Westmarch site and adds a runnable card-game foundation and local presentation slice at `/arcana`. The headless rules engine is fully deterministic and covers automatic Font payment, blocker combat, simultaneous damage, creature Health, spells/priority, persistent Auras, equipment salvage/recovery, consumables, victory, command/event logs, and replay. Card content is declarative and validated. Supabase supplies authenticated command intake, player-private Realtime delivery, sequencing/idempotency, rate/payload limits, reconnect state, persistence, and RLS.

The browser slice includes an original card encyclopedia, prototype deck summary, responsive match board, Font/mana interaction, summon/play rejection flow, attack/life flow, match inspector/event log, reduced-motion setting, and sound control. It is intentionally labeled local: Supabase Realtime online integration, a Phaser scene, production audio assets, and deployed matchmaking remain subsequent work.

## Architecture and agents

- Lead: repository inspection, architecture/security/rules documents, workspace integration, React slice, audio/animation contracts, validation, and report.
- Audit agent: assigned first but stalled without output; the lead completed its documents before implementation.
- Rules agent: `packages/rules/**`.
- Card agent: `packages/cards/**`.
- Server/database agent: `packages/database/**`, Supabase Edge Functions, and the Realtime migration.

The existing root Vite app remains the web application. npm workspaces add `apps/*` and `packages/*`; this avoids destabilizing existing Vercel, CI, routes, and imports. See `current-state-audit.md`, `architecture.md`, `dependency-map.md`, `decision-log.md`, `game-rules.md`, and `security-model.md`.

## Added areas

- `packages/rules`: pure engine, tests, replay, legal actions, simulation.
- `packages/cards`: schemas, 15 declarative effect operators, 40-card FND1 set, two 30-card legal decks, authoring guide and validation CLI.
- `packages/database`: Supabase Realtime transport, command submission, persistence contracts, tests, and setup notes.
- `packages/audio`: typed buses, settings, event profiles, procedural Web Audio placeholder manager.
- `packages/match-renderer`: animation profiles and visual event queue contracts.
- `src/pages/CardGamePage.tsx`: accessible browser vertical-slice UI.
- `assets/licenses.json`: empty third-party inventory and procedural-placeholder declaration.
- `supabase/migrations/20260718000100_fantasy_card_game.sql`: profiles/card sets/cards/collections/decks/deck cards/tickets/matches/players/results/event logs/ratings/settings, indexes, snapshots, and RLS.

## Verification

Executed successfully on 2026-07-18:

```text
npm run test          143 tests passed (45 app, 51 cards, 2 database, 11 protocol, 28 rules, 6 UI)
npm run typecheck     all six workspace packages passed strict TypeScript
npm run lint          passed
npm run build         passed; 2,615 modules transformed
npm run validate:cards 40 cards and 2 decks validated
git diff --check      passed (line-ending notices only)
```

The legacy root app has pre-existing strict `tsc -b` errors in older broad JSON types, so root `typecheck` currently checks every new workspace package while Vite production build validates the existing web integration. Those legacy types should be repaired before CI treats root `tsc -b` as a gate.

Dependency installation reported 22 transitive audit findings (2 low, 8 moderate, 11 high, 1 critical). Do not run a breaking `npm audit fix --force` blindly; triage reachable production paths and upgrade deliberately.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/arcana`. The current board is a local deterministic presentation slice. Headless rules can be exercised with `npm run simulate -w @scon/rules`.

Required web environment:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Production command processing needs Supabase project configuration and server-only secrets inside the Edge Function environment. Never prefix privileged values with `VITE_`.

Apply the new migration using the established Supabase workflow (`supabase db push`). It contains server-write-only policies for authoritative match records and owner policies for player data.

## Two-client and deployment status

The next online milestone is to connect `/arcana` to the Supabase Realtime adapter and protected command processor, then verify two authenticated browser clients against the same persisted match.

Vercel can continue deploying the frontend unchanged. Supabase hosts command intake, persistence, and private Realtime channels; deployment validation still needs two authenticated browsers, reconnect testing, and RLS policy tests.

## Asset replacement

No downloaded art, music, or sounds were added. CSS placeholders and procedural tones are original temporary scaffolding. Add art thumbnails/full images through card manifests, add audio entries through typed profiles, record creator/source/license in `assets/licenses.json`, and keep gameplay code free of raw asset paths. Phaser texture atlases and final audio stems should be introduced when the renderer scene is implemented.

## Known limitations and remaining roadmap

- The visual board is React/CSS, not the required Phaser battlefield; animation/audio packages currently provide contracts/placeholders rather than a mounted final renderer.
- Online Supabase Realtime transport, real matchmaking, protected command processing, and two-browser reconnect are not yet wired end-to-end.
- Deck saving, collection persistence, match history/profile additions, and rating UI are schema/content foundations only.
- There are no Playwright workflows yet; database policy tests require a local Supabase instance.
- Procedural audio is connected to UI and match events; there is no final music stem or production sound library.
- Accessibility foundations exist in HTML, focusable controls, live event text, and reduced motion, but keyboard target selection, high-contrast QA, and screen-reader workflow testing remain.
- Reconnection and hidden-information logic are covered at transport/schema-test level, not a deployed two-browser workflow.
- Dependency audit findings and legacy root TypeScript errors require remediation before production release.

Security priorities are production JWT signature/issuer/audience verification, origin enforcement, distributed rate limiting, log redaction, service-key isolation, RLS tests, replay retention policy, and dependency upgrades. Licensing risk is currently low because no external media is bundled; every future asset must carry real metadata rather than a fabricated license.
