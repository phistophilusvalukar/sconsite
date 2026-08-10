import { z } from 'zod';
import { ACTION_IDS, type PuzzleDefinition } from './types';

const positionSchema = z.object({
  x: z.number().int(),
  y: z.number().int()
});

const attackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  attackBonus: z.number().int(),
  damage: z.number().int().nonnegative(),
  damageType: z.string().min(1),
  agile: z.boolean(),
  range: z.number().int().positive(),
  traits: z.array(z.string())
});

const spellSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  actionId: z.literal('lightning-bolt'),
  actionCost: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  geometry: z.literal('line'),
  range: z.number().int().positive(),
  save: z.literal('reflex'),
  dc: z.number().int().positive(),
  damage: z.number().int().nonnegative(),
  damageType: z.string().min(1)
});

const creatureSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  team: z.enum(['player', 'ally', 'enemy', 'neutral']),
  controlled: z.boolean(),
  position: positionSchema,
  size: z.literal(1),
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
  ac: z.number().int().positive(),
  speed: z.number().int().nonnegative(),
  reach: z.number().int().positive(),
  perception: z.number().int(),
  fortitude: z.number().int(),
  reflex: z.number().int(),
  will: z.number().int(),
  skills: z.object({
    athletics: z.number().int(),
    deception: z.number().int(),
    intimidation: z.number().int()
  }),
  actionIds: z.array(z.enum(ACTION_IDS)),
  attacks: z.array(attackSchema),
  spells: z.array(spellSchema),
  initiative: z.number().int(),
  traits: z.array(z.string())
});

const objectiveSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('defeat-all-enemies') }),
  z.object({ type: z.literal('defeat-specific-enemy'), creatureId: z.string().min(1) }),
  z.object({ type: z.literal('reach-square'), creatureId: z.string().min(1), position: positionSchema }),
  z.object({ type: z.literal('apply-condition'), creatureId: z.string().min(1), condition: z.enum(['off-guard', 'frightened', 'prone', 'grabbed', 'immobilized', 'aided']) }),
  z.object({ type: z.literal('keep-ally-alive'), creatureId: z.string().min(1) })
]);

const intendedCommandSchema = z.object({
  type: z.enum(['USE_ACTION', 'END_TURN', 'RESUME_DELAYED']),
  actorId: z.string().min(1),
  actionId: z.enum(ACTION_IDS).optional(),
  targetId: z.string().optional(),
  attackId: z.string().optional(),
  destination: positionSchema.optional(),
  direction: positionSchema.optional()
});

export const puzzleDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1).max(120),
  summary: z.string().max(600),
  difficulty: z.enum(['tutorial', 'easy', 'moderate', 'hard', 'expert']),
  tags: z.array(z.string().min(1).max(40)).max(12),
  board: z.object({
    width: z.number().int().min(3).max(16),
    height: z.number().int().min(3).max(16),
    terrain: z.array(positionSchema.extend({ type: z.enum(['blocked', 'difficult', 'hazard']) }))
  }),
  creatures: z.array(creatureSchema).min(1).max(20),
  rolls: z.array(z.number().int().min(1).max(20)).max(100),
  objective: objectiveSchema,
  maxRounds: z.number().int().min(1).max(20),
  hints: z.array(z.string().min(1).max(500)).max(10),
  intendedSolution: z.array(intendedCommandSchema).optional(),
  author: z.string().max(120).optional()
});

export function parsePuzzleDefinition(value: unknown): PuzzleDefinition {
  return puzzleDefinitionSchema.parse(value) as PuzzleDefinition;
}

export function safeParsePuzzleDefinition(value: unknown) {
  return puzzleDefinitionSchema.safeParse(value);
}
