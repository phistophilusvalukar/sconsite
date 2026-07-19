# Arcana Frontiers implementation report

## 2026-07-18 playable-milestone update

`/arcana` is now driven by `packages/rules` rather than page-local counters. A player can select either validated prototype deck, start a seeded match against a deterministic AI, commit one hand card per turn as a Font, channel mana, summon creatures through the priority stack, advance turns, ready creatures, attack, deal damage, inspect authoritative events, and copy the command/event replay log. Browser verification completed the Font → mana → summon → next-turn attack flow and reduced the rival from 20 to 18 life.

The multiplayer service is now a runnable Colyseus WebSocket server with `/healthz`, two-player room lifecycle, command transport, player-private snapshots, reconnect handling, local-development auth, and a Supabase JWKS verifier. Its real two-client integration test passes. The web route is not yet connected to this transport; local AI play and server multiplayer are separately runnable foundations.

New `packages/protocol` contracts validate commands, matchmaking, reconnect, snapshots, events, acknowledgements and errors, including hidden-information projection. New `packages/ui` supplies accessible reusable cards, mana/deck displays, modal, match inspector/log and state components.

The presentation milestone now includes browser-unlocked procedural sound cues for UI, Fonts, mana, cards, summoning, attacks, damage, attachments, errors, and results. Event-driven CSS sequences animate channeling, summoning, attack lunges, and impacts; both the explicit reduced-motion setting and the operating-system preference suppress them. Cards in the encyclopedia, hand, and battlefield open an accessible enlarged inspector with complete rules, cost, stats, traditions, traits, keywords, attribution, license, and placeholder-art disclosure.

## Outcome

This run preserves the existing Westmarch site and adds a runnable card-game foundation and local presentation slice at `/arcana`. The headless rules engine is fully deterministic and covers Fonts/mana, creatures/combat, spells/priority, Auras, equipment salvage/recovery, consumables, victory, command/event logs, and replay. Card content is declarative and validated. The server package supplies an authoritative room adapter with hidden-information projection, sequencing/idempotency, rate/payload limits, reconnect, JWT and persistence seams. A Supabase migration supplies the persistent schema and RLS.

The browser slice includes an original card encyclopedia, prototype deck summary, responsive match board, Font/mana interaction, summon/play rejection flow, attack/life flow, match inspector/event log, reduced-motion setting, and sound control. It is intentionally labeled local: a real Colyseus transport, Phaser scene, production audio assets, and deployed matchmaking remain subsequent integration work.

## Architecture and agents

- Lead: repository inspection, architecture/security/rules documents, workspace integration, React slice, audio/animation contracts, validation, and report.
- Audit agent: assigned first but stalled without output; the lead completed its documents before implementation.
- Rules agent: `packages/rules/**`.
- Card agent: `packages/cards/**`.
- Server/database agent: `apps/match-server/**`, `packages/database/**`, and the new migration.

The existing root Vite app remains the web application. npm workspaces add `apps/*` and `packages/*`; this avoids destabilizing existing Vercel, CI, routes, and imports. See `current-state-audit.md`, `architecture.md`, `dependency-map.md`, `decision-log.md`, `game-rules.md`, and `security-model.md`.

## Added areas

- `packages/rules`: pure engine, tests, replay, legal actions, simulation.
- `packages/cards`: schemas, 15 declarative effect operators, 40-card FND1 set, two 30-card legal decks, authoring guide and validation CLI.
- `apps/match-server`: authoritative match adapter and integration tests.
- `packages/database`: persistence contracts and Supabase setup notes.
- `packages/audio`: typed buses, settings, event profiles, procedural Web Audio placeholder manager.
- `packages/match-renderer`: animation profiles and visual event queue contracts.
- `src/pages/CardGamePage.tsx`: accessible browser vertical-slice UI.
- `assets/licenses.json`: empty third-party inventory and procedural-placeholder declaration.
- `supabase/migrations/20260718000100_fantasy_card_game.sql`: profiles/card sets/cards/collections/decks/deck cards/tickets/matches/players/results/event logs/ratings/settings, indexes, snapshots, and RLS.

## Verification

Executed successfully on 2026-07-18:

```text
npm run test          66 tests passed (2 server, 48 cards, 16 rules)
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

Production match-server deployment additionally needs a Supabase URL/JWKS configuration, expected issuer/audience, and a server-only service-role key. Exact adapter wiring remains to be implemented; never prefix privileged values with `VITE_`.

Apply the new migration using the established Supabase workflow (`supabase db push`). It contains server-write-only policies for authoritative match records and owner policies for player data.

## Two-client and deployment status

The authoritative adapter and simulated two-player tests are runnable, but a network listener/Colyseus room registration and browser transport are not yet wired. Consequently there is not yet an honest two-browser command for online play. The next milestone is to add Colyseus dependencies/entrypoint, implement the Supabase JWKS verifier and repository adapter, connect `/arcana` through the shared protocol, and then run two clients (normally ports 5173 and 5174) against one match server.

Vercel can continue deploying the frontend unchanged. The stateful match server needs a separate WebSocket-capable Node host with sticky room routing (or a single instance initially), TLS, allowed-origin configuration, health checks, protected secrets, and Supabase connectivity.

## Asset replacement

No downloaded art, music, or sounds were added. CSS placeholders and procedural tones are original temporary scaffolding. Add art thumbnails/full images through card manifests, add audio entries through typed profiles, record creator/source/license in `assets/licenses.json`, and keep gameplay code free of raw asset paths. Phaser texture atlases and final audio stems should be introduced when the renderer scene is implemented.

## Known limitations and remaining roadmap

- The visual board is React/CSS, not the required Phaser battlefield; animation/audio packages currently provide contracts/placeholders rather than a mounted final renderer.
- Online Colyseus transport, real matchmaking, Supabase JWT adapter, database repository adapter, and two-browser reconnect are not wired end-to-end.
- Deck saving, collection persistence, match history/profile additions, and rating UI are schema/content foundations only.
- There are no Playwright workflows yet; database policy tests require a local Supabase instance.
- Procedural audio is not connected to the page event log and there is no music stem.
- Accessibility foundations exist in HTML, focusable controls, live event text, and reduced motion, but keyboard target selection, high-contrast QA, and screen-reader workflow testing remain.
- Reconnection and hidden-information logic are covered at adapter-test level, not real sockets.
- Dependency audit findings and legacy root TypeScript errors require remediation before production release.

Security priorities are production JWT signature/issuer/audience verification, origin enforcement, distributed rate limiting, log redaction, service-key isolation, RLS tests, replay retention policy, and dependency upgrades. Licensing risk is currently low because no external media is bundled; every future asset must carry real metadata rather than a fabricated license.
