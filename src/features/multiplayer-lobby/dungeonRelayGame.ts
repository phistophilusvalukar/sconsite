import { z } from 'zod';
import type { DungeonRelaySymbol } from '@scon/rules';

export const DUNGEON_SYMBOLS: ReadonlyArray<{
  id: DungeonRelaySymbol;
  label: string;
  shortLabel: string;
  color: string;
  glyph: string;
}> = [
  { id: 'sword', label: 'Red Swords', shortLabel: 'Sword', color: '#ef4444', glyph: '⚔' },
  { id: 'arrow', label: 'Green Arrows', shortLabel: 'Arrow', color: '#22c55e', glyph: '➶' },
  { id: 'shield', label: 'Yellow Shields', shortLabel: 'Shield', color: '#eab308', glyph: '⬟' },
  { id: 'staff', label: 'Blue Staves', shortLabel: 'Staff', color: '#3b82f6', glyph: '✧' },
  { id: 'dagger', label: 'Purple Daggers', shortLabel: 'Dagger', color: '#a855f7', glyph: '†' },
];

const symbolSchema = z.enum(['sword', 'arrow', 'shield', 'staff', 'dagger']);
const playerColorSchema = z.enum(['crimson', 'amber', 'emerald', 'cyan', 'azure', 'violet', 'rose', 'silver']);
const requirementsSchema = z.object({
  sword: z.number().int().nonnegative(),
  arrow: z.number().int().nonnegative(),
  shield: z.number().int().nonnegative(),
  staff: z.number().int().nonnegative(),
  dagger: z.number().int().nonnegative(),
});
const cardSchema = z.object({
  id: z.string().uuid(),
  symbol: symbolSchema,
  symbols: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const dungeonRelayStateSchema = z.object({
  match: z.object({
    id: z.string().uuid(),
    teamId: z.string().uuid(),
    leaderId: z.string().min(1),
    status: z.enum(['active', 'won', 'lost']),
    phase: z.enum(['active', 'resolving', 'complete']),
    dungeonPosition: z.number().int().min(1).max(11),
    totalDungeons: z.literal(11),
    revision: z.number().int().nonnegative(),
    resolveAt: z.string().nullable(),
  }),
  dungeon: z.object({
    position: z.number().int().min(1).max(11),
    isBoss: z.boolean(),
    name: z.string().min(1),
    requirements: requirementsSchema,
  }),
  players: z.array(z.object({
    userId: z.string().min(1),
    username: z.string().min(1),
    avatar: z.string(),
    color: playerColorSchema,
    status: z.enum(['active', 'dead']),
    seat: z.number().int().min(1).max(8),
    handCount: z.number().int().nonnegative(),
    deckCount: z.number().int().nonnegative(),
    discardCount: z.number().int().nonnegative(),
  })).min(2).max(8),
  self: z.object({
    userId: z.string().min(1),
    status: z.enum(['active', 'dead']),
    hand: z.array(cardSchema).max(5),
  }),
  playedCards: z.array(cardSchema.extend({
    userId: z.string().min(1),
    username: z.string().min(1),
    color: playerColorSchema,
    playedOrder: z.number().nonnegative(),
  })),
});

export type DungeonRelayState = z.infer<typeof dungeonRelayStateSchema>;
export type DungeonRelayHandCard = DungeonRelayState['self']['hand'][number];
export type DungeonRelayPublicCard = DungeonRelayState['playedCards'][number];

export function getDungeonSymbol(symbol: DungeonRelaySymbol) {
  return DUNGEON_SYMBOLS.find(candidate => candidate.id === symbol) ?? DUNGEON_SYMBOLS[0];
}

export function dungeonRelayErrorMessage(message: string) {
  const errors: Record<string, string> = {
    match_not_found: 'This Dungeon Relay match is no longer available.',
    select_one_to_five_cards: 'Select at least one card to play.',
    duplicate_card_selection: 'Each selected card can only be played once.',
    match_not_accepting_plays: 'The dungeon is resolving. Hold on for the next chamber.',
    spectators_cannot_play: 'You are spectating and can no longer play cards.',
    card_not_in_hand: 'One of those cards is no longer in your hand.',
    team_leader_required: 'Only the team leader can start a new run.',
    at_least_two_players: 'Dungeon Relay needs at least two players.',
  };
  const key = Object.keys(errors).find(error => message.includes(error));
  return key ? errors[key] : 'The game could not complete that action. Please try again.';
}
