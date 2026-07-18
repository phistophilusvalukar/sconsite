# Dependency map and ownership

| Area | May depend on | Must not depend on |
|---|---|---|
| `packages/rules` | cards contracts (types only) | React, Phaser, Colyseus, Supabase, platform APIs |
| `packages/cards` | Zod | UI, server, database |
| `packages/protocol` | Zod, rules/card types | renderer/database implementation |
| `apps/match-server` | rules, cards, protocol, database, Colyseus | React/Phaser |
| `packages/match-renderer` | protocol, Phaser | rules mutation/database |
| `packages/audio` | event types, Howler/browser | canonical rules decisions |
| root web | ui, renderer, audio, protocol | service credentials |
| `packages/database` | Supabase, persistence interfaces | renderer |

Ownership follows these directories. Shared contract changes require integration review.
