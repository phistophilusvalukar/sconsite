import { cardDefinitionSchema, type CardDefinition, type ManaTradition } from "./schema";

const SET = "FND1";
const sourceMetadata = { origin: "original" as const, sourceName: "Scon prototype set", license: "CC0-1.0", attribution: "Original prototype content by the Scon project" };
const art = (id: string) => ({
  full: `/assets/cards/generated/${id}.jpg`,
  thumbnail: `/assets/cards/generated/${id}.jpg`,
  loadingPlaceholder: "/assets/cards/placeholders/loading.svg",
  artist: "OpenAI image generation",
  license: { license: "Project-generated asset", attribution: "Generated for Arcana Frontiers with OpenAI image tools, July 2026" },
});
const cost = (generic = 0, typed?: ManaTradition) => ({ generic, ...(typed && typed !== "generic" ? { [typed]: 1 } : {}) });
const base = (id: string, name: string, traditions: ManaTradition[], rulesText: string) => ({ schemaVersion: 1 as const, id, version: 1, setCode: SET, name, traditions, cost: cost(), traits: [], keywords: [], rulesText, art: art(id), audioProfile: "card.prototype", animationProfile: "card.prototype", targets: [], effects: [], abilities: [], sourceMetadata });
const card = (value: unknown): CardDefinition => cardDefinitionSchema.parse(value);

const fonts = [
  ["emberwell-font", "Emberwell", "primal"], ["rootsong-font", "Rootsong Spring", "primal"],
  ["sunward-font", "Sunward Shrine", "divine"], ["mercy-font", "Well of Mercy", "divine"],
  ["whisper-font", "Whispering Hollow", "occult"], ["dream-font", "Dreamglass Pool", "occult"],
  ["star-font", "Star-Scribed Basin", "arcane"], ["wayfarer-font", "Wayfarer's Source", "generic"],
].map(([id, name, tradition]) => card({ ...base(id!, name!, [tradition! as ManaTradition], `Exhaust: Gain 1 ${tradition} mana.`), type: "font", produces: [tradition], abilities: [{ id: "channel", kind: "activated", timing: "action", cost: { exhaustSource: true }, targets: [], effects: [{ op: "gainMana", player: "$controller", tradition, amount: 1 }], limit: "oncePerTurn" }] }));

const creatureData = [
  ["bramble-runner", "Bramble Runner", "primal", 1, 2, 1, "Swift"], ["cinder-tusk", "Cinder Tusk", "primal", 2, 3, 2, "On attack, deal 1 damage to the defending player."],
  ["mossback-guardian", "Mossback Guardian", "primal", 3, 3, 5, "Guard"], ["storm-claw", "Storm-Claw Adept", "primal", 3, 4, 3, "Swift"],
  ["oakheart-colossus", "Oakheart Colossus", "primal", 5, 6, 7, "Trample"], ["forgepath-scout", "Forgepath Scout", "primal", 2, 2, 3, "When summoned, ready a Font."],
  ["lantern-acolyte", "Lantern Acolyte", "divine", 1, 1, 3, "When summoned, heal your player 1."], ["veil-confessor", "Veil Confessor", "occult", 2, 2, 3, "When summoned, the opponent discards a card."],
  ["dawnshield-sentinel", "Dawnshield Sentinel", "divine", 3, 2, 6, "Guard"], ["memory-moth", "Memory Moth", "occult", 2, 2, 2, "On death, draw a card."],
  ["grave-orchid-keeper", "Grave-Orchid Keeper", "occult", 4, 4, 5, "Your healing effects restore 1 additional life."], ["haloed-stag", "Haloed Stag", "divine", 4, 4, 6, "When healed, this gets +1 power this turn."],
] as const;
const creatures = creatureData.map(([id, name, tradition, generic, power, health, text]) => card({ ...base(id, name, [tradition], text), type: "creature", cost: cost(generic, tradition), power, health, keywords: ["Swift", "Guard", "Trample"].filter((keyword) => text.includes(keyword)), equipmentSlots: ["weapon", "armor", "accessory"], consumableSlots: 1 }));

const targetCreature = [{ id: "target", controller: "any", zone: "creatureField", cardTypes: ["creature"], min: 1, max: 1, optional: false, filters: [] }];
const spellData = [
  ["spark-lance", "Spark Lance", "primal", 1, "Deal 3 damage to a creature or player.", { op: "dealDamage", source: "$source", target: "$target.0", amount: 3 }],
  ["wild-renewal", "Wild Renewal", "primal", 1, "A creature gets +2/+2 this turn.", { op: "modifyStats", target: "$target.0", power: 2, health: 2, duration: "turn" }],
  ["rally-the-roots", "Rally the Roots", "primal", 2, "Ready a creature.", { op: "ready", target: "$target.0" }],
  ["stone-surge", "Stone Surge", "primal", 2, "Deal 2 damage and exhaust a creature.", { op: "runRegisteredEffect", handler: "prototype.stoneSurge" }],
  ["gentle-radiance", "Gentle Radiance", "divine", 1, "Heal a creature or player 4.", { op: "heal", target: "$target.0", amount: 4 }],
  ["thought-fracture", "Thought Fracture", "occult", 2, "Opponent discards two cards.", { op: "discardCards", player: "$opponent", count: 2 }],
  ["recall-the-fallen", "Recall the Fallen", "divine", 2, "Return a creature from your boneyard to your hand.", { op: "moveCard", target: "$target.0", to: "hand" }],
  ["deny-the-echo", "Deny the Echo", "occult", 2, "Counter a stack effect.", { op: "counterStackEffect", target: "$target.0" }],
] as const;
const spellTargets = {
  "spark-lance": [{ id: "target", controller: "any", zone: ["creatureField", "player"], min: 1, max: 1, optional: false, filters: [] }],
  "gentle-radiance": [{ id: "target", controller: "self", zone: ["creatureField", "player"], min: 1, max: 1, optional: false, filters: [] }],
  "recall-the-fallen": [{ id: "target", controller: "self", zone: "boneyard", cardTypes: ["creature"], min: 1, max: 1, optional: false, filters: ["friendly"] }],
  "deny-the-echo": [{ id: "target", controller: "opponent", zone: "actionStack", min: 1, max: 1, optional: false, filters: [] }],
} as const;
const spells = spellData.map(([id, name, tradition, generic, text, effect], index) => card({ ...base(id, name, [tradition], text), type: "spell", speed: index === 7 ? "reaction" : "action", cost: cost(generic, tradition), targets: spellTargets[id as keyof typeof spellTargets] ?? targetCreature, effects: [effect] }));

const auras = [
  ["canopy-fury", "Canopy Fury", "primal", "Your creatures have +1 power."],
  ["season-of-thorns", "Season of Thorns", "primal", "The first enemy attacker each turn takes 1 damage."],
  ["hymn-of-returning-light", "Hymn of Returning Light", "divine", "At turn start, heal your player 1."],
  ["quieting-veil", "Quieting Veil", "occult", "The opponent's first spell each turn costs 1 more."],
] as const;
const auraMetadata = {
  "canopy-fury": [{ id: "canopy-fury-power", kind: "statModifier", scope: "friendlyCreatures", power: 1, health: 0 }],
  "season-of-thorns": [{ id: "season-thorns-retaliation", kind: "trigger", event: "attackerDeclared", effects: [{ op: "dealDamage", source: "$source", target: "$target.0", amount: 1 }], limit: "oncePerTurn" }],
  "hymn-of-returning-light": [{ id: "hymn-turn-heal", kind: "trigger", event: "turnStart", effects: [{ op: "heal", target: "$controller", amount: 1 }], limit: "none" }],
  "quieting-veil": [{ id: "quieting-veil-cost", kind: "costModifier", scope: "enemyCards", cardType: "spell", amount: 1 }],
} as const;
const auraCards = auras.map(([id, name, tradition, text]) => card({ ...base(id, name, [tradition], text), type: "aura", cost: cost(2, tradition), persistentEffects: auraMetadata[id] }));

const itemData = [
  ["emberedge", "Emberedge", "primal", "weapon", 2, 0, "+2 power while attached."], ["barkplate", "Barkplate", "primal", "armor", 0, 3, "+3 health while attached."],
  ["sun-thread-charm", "Sun-Thread Charm", "divine", "accessory", 1, 1, "+1/+1 while attached."], ["echo-needle", "Echo Needle", "occult", "weapon", 1, 0, "+1 power; on hit, opponent discards a card."],
] as const;
const items = itemData.map(([id, name, tradition, slot, power, health, text]) => card({ ...base(id, name, [tradition], text), type: "magicItem", cost: cost(1, tradition), slot, equipCost: cost(1), targets: targetCreature, effects: [{ op: "attachItem", item: "$source", creature: "$target.0" }], abilities: [{ id: "imbue", kind: "continuous", timing: "static", targets: [], effects: [{ op: "modifyStats", target: "$target.0", power, health, duration: "whileAttached" }], limit: "none" }] }));

const consumableData = [
  ["redleaf-tonic", "Redleaf Tonic", "primal", "potion", "Heal bearer 3.", { op: "heal", target: "$source", amount: 3 }],
  ["thunderseed-flask", "Thunderseed Flask", "primal", "bomb", "Deal 3 damage to a target.", { op: "dealDamage", source: "$source", target: "$target.0", amount: 3 }],
  ["saintglass-vial", "Saintglass Vial", "divine", "talisman", "Prevent the bearer's next destruction.", { op: "runRegisteredEffect", handler: "prototype.saintglassWard" }],
  ["inkdream-scroll", "Inkdream Scroll", "occult", "scroll", "Draw two cards, then discard one.", { op: "runRegisteredEffect", handler: "prototype.inkdreamExchange" }],
] as const;
const consumables = consumableData.map(([id, name, tradition, subtype, text, effect]) => card({ ...base(id, name, [tradition], text), type: "consumable", cost: cost(1, tradition), subtype, charges: 1, recoveryCost: cost(1), targets: targetCreature, abilities: [{ id: "consume", kind: "activated", timing: "action", cost: { charges: 1 }, targets: targetCreature, effects: [effect], limit: "none" }] }));

export const prototypeCards: readonly CardDefinition[] = [...fonts, ...creatures, ...spells, ...auraCards, ...items, ...consumables];
export const prototypeCardsById = new Map(prototypeCards.map((definition) => [definition.id, definition]));
