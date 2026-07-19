import { z } from "zod";

export const CARD_SCHEMA_VERSION = 1 as const;
export const manaTraditionSchema = z.enum(["arcane", "divine", "occult", "primal", "generic"]);
export type ManaTradition = z.infer<typeof manaTraditionSchema>;

export const manaCostSchema = z.object({
  generic: z.number().int().nonnegative().default(0),
  arcane: z.number().int().nonnegative().optional(),
  divine: z.number().int().nonnegative().optional(),
  occult: z.number().int().nonnegative().optional(),
  primal: z.number().int().nonnegative().optional(),
}).strict();

export const sourceMetadataSchema = z.object({
  origin: z.enum(["original", "mechanically-adapted"]),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  license: z.string().min(1),
  attribution: z.string().min(1),
  notes: z.string().min(1).optional(),
}).strict();

const assetLicenseSchema = z.object({ license: z.string().min(1), attribution: z.string().min(1) }).strict();
export const artManifestSchema = z.object({
  full: z.string().min(1), thumbnail: z.string().min(1), loadingPlaceholder: z.string().min(1).optional(),
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict().optional(),
  artist: z.string().min(1).optional(), license: assetLicenseSchema,
}).strict();

const zoneSchema = z.enum(["deck", "hand", "fontRow", "creatureField", "supportField", "salvageField", "actionStack", "boneyard", "exile", "player"]);
export const targetSchema = z.object({
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  controller: z.enum(["self", "opponent", "any"]),
  zone: z.union([zoneSchema, z.array(zoneSchema).min(2)]),
  cardTypes: z.array(z.enum(["font", "creature", "spell", "aura", "magicItem", "consumable"])).min(1).optional(),
  min: z.number().int().nonnegative().default(1), max: z.number().int().positive().default(1), optional: z.boolean().default(false),
  filters: z.array(z.enum(["friendly", "enemy", "ready", "damaged", "attached", "unattached"])).default([]),
}).strict().refine((target: { min: number; max: number }) => target.max >= target.min, "target max must be >= min");

const refSchema = z.string().regex(/^\$(source|controller|opponent|target\.\d+)$/);
const effectSchemas = [
  z.object({ op: z.literal("dealDamage"), source: refSchema, target: refSchema, amount: z.number().int().positive() }).strict(),
  z.object({ op: z.literal("heal"), target: refSchema, amount: z.number().int().positive() }).strict(),
  z.object({ op: z.literal("drawCards"), player: refSchema, count: z.number().int().positive() }).strict(),
  z.object({ op: z.literal("discardCards"), player: refSchema, count: z.number().int().positive() }).strict(),
  z.object({ op: z.literal("gainMana"), player: refSchema, tradition: manaTraditionSchema, amount: z.number().int().positive() }).strict(),
  z.object({ op: z.literal("spendMana"), player: refSchema, cost: manaCostSchema }).strict(),
  z.object({ op: z.literal("moveCard"), target: refSchema, to: z.enum(["hand", "creatureField", "supportField", "salvageField", "boneyard", "exile"]) }).strict(),
  z.object({ op: z.literal("summonCreature"), cardId: z.string().min(1), controller: refSchema }).strict(),
  z.object({ op: z.literal("createToken"), tokenId: z.string().min(1), controller: refSchema, count: z.number().int().positive().default(1) }).strict(),
  z.object({ op: z.literal("attachItem"), item: refSchema, creature: refSchema }).strict(),
  z.object({ op: z.literal("modifyStats"), target: refSchema, power: z.number().int(), health: z.number().int(), duration: z.enum(["turn", "whileAttached", "persistent"]) }).strict(),
  z.object({ op: z.literal("ready"), target: refSchema }).strict(),
  z.object({ op: z.literal("exhaust"), target: refSchema }).strict(),
  z.object({ op: z.literal("counterStackEffect"), target: refSchema }).strict(),
  z.object({ op: z.literal("runRegisteredEffect"), handler: z.string().regex(/^prototype\.[a-zA-Z][a-zA-Z0-9]*$/) }).strict(),
] as const;
export const effectSchema = z.discriminatedUnion("op", effectSchemas);
export type EffectDefinition = z.infer<typeof effectSchema>;

export const abilitySchema = z.object({
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  kind: z.enum(["activated", "triggered", "continuous"]),
  timing: z.enum(["action", "reaction", "onPlay", "onAttack", "onDeath", "turnStart", "turnEnd", "static"]),
  cost: z.object({ mana: manaCostSchema.optional(), exhaustSource: z.boolean().optional(), charges: z.number().int().positive().optional() }).strict().optional(),
  targets: z.array(targetSchema).default([]), effects: z.array(effectSchema).min(1),
  limit: z.enum(["none", "oncePerTurn", "oncePerMatch"]).default("none"),
}).strict();

const base = z.object({
  schemaVersion: z.literal(CARD_SCHEMA_VERSION), id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), version: z.number().int().positive(),
  setCode: z.string().regex(/^[A-Z0-9]{2,8}$/), name: z.string().min(1).max(80), traditions: z.array(manaTraditionSchema).min(1),
  cost: manaCostSchema, traits: z.array(z.string().min(1)).default([]), keywords: z.array(z.string().min(1)).default([]),
  rulesText: z.string().min(1), flavorText: z.string().min(1).optional(), art: artManifestSchema,
  audioProfile: z.string().min(1), animationProfile: z.string().min(1), targets: z.array(targetSchema).default([]),
  effects: z.array(effectSchema).default([]), abilities: z.array(abilitySchema).default([]), sourceMetadata: sourceMetadataSchema,
}).strict();

const font = base.extend({ type: z.literal("font"), produces: z.array(manaTraditionSchema).min(1) }).strict();
const creature = base.extend({ type: z.literal("creature"), power: z.number().int().nonnegative(), health: z.number().int().positive(), equipmentSlots: z.array(z.enum(["weapon", "armor", "accessory"])), consumableSlots: z.number().int().nonnegative() }).strict();
const spell = base.extend({ type: z.literal("spell"), speed: z.enum(["action", "reaction"]) }).strict();
const aura = base.extend({ type: z.literal("aura") }).strict();
const magicItem = base.extend({ type: z.literal("magicItem"), slot: z.enum(["weapon", "armor", "accessory"]), equipCost: manaCostSchema }).strict();
const consumable = base.extend({ type: z.literal("consumable"), subtype: z.enum(["potion", "bomb", "scroll", "talisman", "mutagen"]), charges: z.number().int().positive(), recoveryCost: manaCostSchema }).strict();
export const persistentAuraEffectSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().min(1), kind: z.literal("statModifier"), scope: z.enum(["friendlyCreatures", "enemyCreatures"]), power: z.number().int(), health: z.number().int() }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal("costModifier"), scope: z.enum(["friendlyCards", "enemyCards"]), cardType: z.enum(["creature", "spell", "aura", "magicItem", "consumable"]), amount: z.number().int() }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal("trigger"), event: z.enum(["turnStart", "attackerDeclared"]), effects: z.array(effectSchema).min(1), limit: z.enum(["none", "oncePerTurn"]) }).strict(),
]);
const auraWithMetadata = aura.extend({ persistentEffects: z.array(persistentAuraEffectSchema).min(1) }).strict();
export const cardDefinitionSchema = z.discriminatedUnion("type", [font, creature, spell, auraWithMetadata, magicItem, consumable]);
export type CardDefinition = z.infer<typeof cardDefinitionSchema>;

export const deckSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), version: z.number().int().positive(), name: z.string().min(1).max(80),
  format: z.literal("prototype-30"), cards: z.array(z.object({ cardId: z.string(), version: z.number().int().positive(), count: z.number().int().positive() }).strict()).min(1),
}).strict();
export type DeckDefinition = z.infer<typeof deckSchema>;
export type PersistentAuraEffect = z.infer<typeof persistentAuraEffectSchema>;
