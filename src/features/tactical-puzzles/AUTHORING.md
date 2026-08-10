# Tactical puzzle authoring

Tactical puzzles are inert, versioned JSON. The editor and bundled examples both use the same `PuzzleDefinition` schema in `engine/schema.ts`, and editor test-play calls the same `initializeGame` / `executeCommand` path as normal play.

## Shape

- `schemaVersion`: currently `1`.
- `id`: lowercase letters, digits, and hyphens. This is also the stable progress key.
- `board`: integer `width`, `height`, and optional `blocked`, `difficult`, or `hazard` terrain cells.
- `creatures`: exactly one `player`, optional controlled `ally` creatures, and one or more `enemy` creatures for defeat objectives.
- `rolls`: natural d20 results from `1` through `20`, consumed from left to right. Actions that do not make a check do not consume a roll.
- `objective`: serializable data; never executable JavaScript.
- `maxRounds`: failure occurs when initiative would wrap beyond this value.

Coordinates are zero-based in JSON. `{ "x": 0, "y": 0 }` is shown as `A1` in the UI. Positions are grid coordinates, never pixels.

## Supported actions

`stride`, `step`, `strike`, `feint`, `demoralize`, `shove`, `trip`, `grapple`, `aid`, `delay`, and `lightning-bolt` are supported. A creature can only use actions listed in its `actionIds`. Strike reads the selected `AttackDefinition`; Lightning Bolt reads a serializable line `SpellDefinition`.

The current puzzle-focused rules subset uses eight-direction square movement, Chebyshev reach, fixed damage, normal/agile MAP, actor-relative Feint, dynamically calculated flanking, and deterministic basic Reflex saves for line spells.

## Conditions and objectives

Supported conditions are `off-guard`, `frightened`, `prone`, `grabbed`, `immobilized`, and `aided`. Supported objectives are defeat all enemies, defeat a specific enemy, reach a square, apply a condition, and keep an ally alive. The editor never stores functions or source code.

## Validation and import

Run **Validate** before saving or test-playing. Schema errors include their JSON path. Domain validation also catches missing/duplicate players, missing enemies, out-of-bounds or overlapping creatures, blocked occupied cells, invalid HP, missing attacks/spells, broken objective references, and likely roll-queue problems.

Use **Export JSON** for a readable manual-authoring starting point. **Import JSON** validates before replacing the active draft. The five definitions in `data/puzzles.ts` are maintained examples of Strike, Feint, flanking, Shove plus a line spell, and roll-order tactics.

## Persistence

Authenticated saves use `tactical_puzzle_designs` under owner-only Supabase RLS. The client submits a solved result to the protected `record_tactical_puzzle_completion` command, which owns all canonical writes to `tactical_puzzle_progress`; users can only read their own rows. Anonymous drafts and completion marks use browser-local storage so the game remains playable without an account. Apply `supabase/migrations/20260810000100_tactical_puzzles.sql` before enabling cloud saves.
