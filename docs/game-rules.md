# Prototype game rules

Two players begin at 20 life, shuffle with an injected seeded RNG, draw five, and alternate turns. Zones are deck, hand, font row, creature field, support field, salvage field, action stack, boneyard, and exile.

Once each turn the active player may commit a hand card face-down as a basic Font; it loses printed identity there, produces one Generic mana, and exhausts. Printed Fonts may produce Arcane, Divine, Occult, Primal, or Generic mana. Fonts ready at turn start.

Cards are Font, Creature, Spell, Aura, Magic Item, or Consumable. Costs are paid from the mana pool. Creatures enter exhausted, retain damage until end of turn, and ready at their controller's turn. A ready creature attacks a creature or opposing player and exhausts; creature damage is simultaneous. Lethal creatures enter the boneyard.

Spells/effects enter a LIFO stack. The opponent receives priority, reactions and passes alternate, and two consecutive passes resolve the newest effect. Priority continues until empty.

Auras persist in support. Items occupy weapon, armor, or accessory slots and drop to their owner's salvage field when the bearer dies. Legal friendly creatures can recover them for the equip cost. Prepared consumables attach with charges; the last use sends them to the boneyard, while unused consumables drop to salvage with their bearer.

A player loses at zero life, on drawing from an empty deck, by concession, or an explicit defeat effect. Initial combat targets directly; blockers/lanes are future rule modules.
