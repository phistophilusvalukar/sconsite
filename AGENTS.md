# Project Rules

## Architecture
- Protected Supabase server-side command processing is authoritative; clients submit commands and never mutate canonical state.
- `packages/rules` is deterministic and platform independent.
- The renderer displays resolved events and server snapshots. React owns site UI/overlays; Phaser owns the battlefield.
- Supabase stores persistent data and Supabase Realtime delivers live match snapshots and events.
- Authoritative command processing runs behind protected Supabase server-side APIs; clients never publish canonical state.

## Determinism and hidden information
- Inject seeded randomness; never call `Math.random` in rules.
- Commands and replays must reproduce the same event sequence.
- Never serialize an opponent's private hand or deck contents. Visual hiding is not security.

## Cards and quality
- Prefer declarative effects; never execute JavaScript from card data or put card rules in React.
- Validate external/network data with Zod. Use strict TypeScript and avoid `any`.
- Test rules changes and effect operators. Preserve existing features.
- Run lint, typecheck, tests, and builds; document unresolved issues honestly.

## Assets
- Do not add copyrighted or ambiguously licensed media.
- Track source/license metadata. Mark placeholders and reference assets through manifests.
