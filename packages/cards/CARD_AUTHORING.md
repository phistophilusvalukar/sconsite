# Card authoring

Cards are versioned, inert JSON-compatible records validated by Zod. Import the public API from `@scon/cards`; do not import internal files. A card identity is its stable `id` plus positive integer `version`. Published versions are immutable: copy the record and increment `version` when rules-relevant data changes.

## Workflow

1. Add a definition to `src/prototype-set.ts` (production sets should use one data module per set).
2. Use a kebab-case globally stable ID, original name and prose, and the current `schemaVersion`.
3. Supply an explicit mana cost, traits, keywords, targets, effects/abilities, art manifest, audio and animation profile.
4. Record the actual origin, license and attribution. Never guess a license. Project placeholders use `CC0-1.0` only when generated and dedicated to the public domain by this project.
5. Run `npm run validate`, `npm test`, and `npm run typecheck` in this package.

## Targets and references

Targets declare controller, zone, optional card types, cardinality, and filters. Effects may only refer to `$source`, `$controller`, `$opponent`, or a declared selection such as `$target.0`. The rules engine performs runtime legality checks; this package validates the authored shape.

```ts
targets: [{
  id: "target", controller: "opponent", zone: "creatureField",
  cardTypes: ["creature"], min: 1, max: 1, optional: false, filters: ["enemy"]
}],
effects: [{ op: "dealDamage", source: "$source", target: "$target.0", amount: 3 }]
```

Available operators are encoded by `effectSchema`: damage, healing, drawing/discarding, mana gain/spend, movement, summoning/token creation, attachment, stat modification, ready/exhaust, countering, and registered effects. Operators are declarative instructions; this package never executes them.

`runRegisteredEffect` is the escape hatch for effects that cannot yet be expressed compositionally. Handler IDs must use `prototype.<name>` and must map to trusted, compiled rules-engine handlers. Card data must never contain JavaScript, expressions, `eval`, or module paths. Prefer adding a general, tested operator over adding a handler.

## Card type fields

- `font`: `produces`
- `creature`: power, health, equipment slots, consumable slots
- `spell`: action or reaction speed
- `aura`: persistent abilities/effects
- `magicItem`: equipment slot and equip cost
- `consumable`: subtype, charges and recovery cost

## Deck legality

The prototype format contains exactly 30 cards. Non-Font cards are limited to three copies. Every entry pins a card version, duplicate entries are rejected, and all identities must exist in the supplied catalog. Printed Fonts are exempt from the copy cap. Persistent storage and replay snapshots must retain pinned versions.

## Assets

Card frames and artwork are independent. Provide full and thumbnail paths, optional loading placeholder/focus, and truthful license metadata. Recommended final artwork is 1600x1200 WebP/AVIF with a 400x300 thumbnail; keep the subject inside the center safe area. Current paths are deliberately non-final placeholders for the renderer's fallback pipeline.
