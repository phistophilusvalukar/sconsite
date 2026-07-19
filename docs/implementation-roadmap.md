# Implementation roadmap

1. Preserve the root site and add workspace/package boundaries, audit docs, rules spec, and threat model.
2. Build deterministic rules, validated prototype cards/decks, scripted headless match, and replay tests.
3. Add a local React/Phaser match route, accessible overlays, event animations, procedural placeholder audio, and settings.
4. Add Supabase Realtime delivery, protected command processing, private views, sequencing, reconnect, rate/payload limits, and persistence.
5. Add collection/deck/profile/history persistence and RLS migration.
6. Add browser workflows, CI, performance/accessibility/security review, and deployment hardening.

The vertical slice prioritizes honest runnable behavior. Features requiring external Supabase configuration use explicit local adapters and documented environment requirements, not fake production claims.
