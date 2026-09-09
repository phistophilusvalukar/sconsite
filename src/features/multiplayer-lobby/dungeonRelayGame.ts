import { z } from 'zod';
import { DUNGEON_RELAY_SPECIALS, type DungeonRelaySpecial, type DungeonRelayCardType, type DungeonRelayClass, type DungeonRelayEventType, type DungeonRelaySymbol } from '@scon/rules';

export const DUNGEON_SPECIAL_CARDS: Readonly<Record<DungeonRelaySpecial, { name: string; description: string; glyph: string }>> = {
  slay_boss: { name: 'Divine Judgment', description: 'Instantly defeat a Mini-Boss or the final Boss.', glyph: '♜' },
  counter_event: { name: 'Hex Breaker', description: 'Cancel the current Event. Outside an Event, draw 2 cards.', glyph: '✦' },
  slay_person: { name: 'Decisive Strike', description: 'Instantly defeat a Person.', glyph: '⚔' },
  gift_three: { name: 'Arcane Gift', description: 'Choose another surviving player to draw 3 cards.', glyph: '✧' },
  wild_three: { name: 'Perfect Plan', description: 'Choose any 3 symbols, including repeated colors.', glyph: '✴' },
  cleric_blessing: { name: 'Shared Salvation', description: 'Give half your remaining deck (rounded down) to another player, reviving them if dead. Or every other surviving player draws 2 cards.', glyph: '☀' },
  slay_beast: { name: 'Beast Slayer', description: 'Instantly defeat a Beast.', glyph: '➶' },
  all_colors: { name: 'Prismatic Formula', description: 'Contribute 1 of each of the five colors.', glyph: '⚗' },
};

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

export const DUNGEON_CARD_TYPES: Readonly<Record<DungeonRelayCardType, { label: string; glyph: string }>> = {
  obstacle: { label: 'Obstacle', glyph: '◆' },
  person: { label: 'Person', glyph: '♟' },
  beast: { label: 'Beast', glyph: '♞' },
  hazard: { label: 'Hazard', glyph: '⚠' },
  mini_boss: { label: 'Mini-Boss', glyph: '♛' },
  boss: { label: 'Boss', glyph: '♜' },
  event: { label: 'Event', glyph: '✦' },
};

export const DUNGEON_EVENTS: Readonly<Record<DungeonRelayEventType, { title: string; instructions: string }>> = {
  discard_shields: { title: 'Shields Must Fall', instructions: 'Play every Shield normally or discard it to this event, then confirm.' },
  give_hands: { title: 'Choose the Champion', instructions: 'Vote for one surviving player to receive every hand, then everyone confirms.' },
  pass_left: { title: 'Arcane Exchange', instructions: 'When everyone confirms, each hand passes to the next surviving player.' },
  discard_multis: { title: 'Travel Light', instructions: 'Play every multi-symbol card normally or discard it to this event, then confirm.' },
};

export const DUNGEON_CLASS_POWERS: Readonly<Record<DungeonRelayClass, { name: string; description: string; cost: number; target: 'none' | 'player' }>> = {
  barbarian: { name: 'Challenge', description: 'Defeat a Person card immediately.', cost: 2, target: 'none' },
  swashbuckler: { name: 'Rally', description: 'Every other surviving player draws 1 card.', cost: 2, target: 'none' },
  ranger: { name: 'Master Hunter', description: 'Defeat a Beast card immediately.', cost: 2, target: 'none' },
  alchemist: { name: 'Quick Mix', description: 'Draw 2 cards.', cost: 1, target: 'none' },
  rogue: { name: 'Bypass', description: 'Defeat an Obstacle card immediately.', cost: 2, target: 'none' },
  investigator: { name: 'Reconstruct', description: 'Recover the 2 oldest cards from your discard pile.', cost: 2, target: 'none' },
  wizard: { name: 'Freeze Time', description: 'Pause the clock until any player plays a card.', cost: 2, target: 'none' },
  witch: { name: 'Counter-Curse', description: 'Defeat a Hazard card immediately.', cost: 2, target: 'none' },
  champion: { name: 'Intercede', description: 'Exclude one player from the current event.', cost: 2, target: 'player' },
  cleric: { name: 'Restoration', description: "Put one player's discard pile on top of their deck.", cost: 4, target: 'player' },
};

const symbolSchema = z.enum(['sword', 'arrow', 'shield', 'staff', 'dagger']);
const cardTypeSchema = z.enum(['obstacle', 'person', 'beast', 'hazard', 'mini_boss', 'boss', 'event']);
const eventTypeSchema = z.enum(['discard_shields', 'give_hands', 'pass_left', 'discard_multis']);
const playerColorSchema = z.enum(['crimson', 'rose', 'emerald', 'mint', 'violet', 'lavender', 'azure', 'cyan', 'amber', 'gold']);
const playerClassSchema = z.enum(['barbarian', 'swashbuckler', 'ranger', 'alchemist', 'rogue', 'investigator', 'wizard', 'witch', 'champion', 'cleric']);
// Hash-derived card IDs are valid PostgreSQL UUID values but do not carry an
// RFC version/variant nibble, which z.string().uuid() intentionally requires.
const postgresUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Invalid PostgreSQL UUID',
);
const requirementsSchema = z.object({
  sword: z.number().int().nonnegative(),
  arrow: z.number().int().nonnegative(),
  shield: z.number().int().nonnegative(),
  staff: z.number().int().nonnegative(),
  dagger: z.number().int().nonnegative(),
});
export const dungeonRelayCardSchema = z.object({
  id: postgresUuidSchema,
  symbol: symbolSchema,
  symbols: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  special: z.enum(DUNGEON_RELAY_SPECIALS).nullable().optional(),
  chosenSymbols: requirementsSchema.refine(value => Object.values(value).reduce((sum, count) => sum + count, 0) === 3, 'Choose exactly three symbols').nullable().optional(),
});
const cardSchema = dungeonRelayCardSchema;

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
    timerDeadline: z.string().nullable(),
    timerFrozen: z.boolean(),
    timerRemainingSeconds: z.number().int().min(0).max(300),
    timerResumeLockedUntil: z.string().nullable(),
  }),
  dungeon: z.object({
    position: z.number().int().min(1).max(11),
    isBoss: z.boolean(),
    name: z.string().min(1),
    cardType: cardTypeSchema,
    eventType: eventTypeSchema.nullable(),
    eventStage: z.enum(['voting', 'confirming', 'completed']).nullable(),
    selectedTargetId: z.string().nullable(),
    requirements: requirementsSchema,
  }),
  players: z.array(z.object({
    userId: z.string().min(1),
    username: z.string().min(1),
    avatar: z.string(),
    color: playerColorSchema,
    classId: playerClassSchema,
    status: z.enum(['active', 'dead']),
    seat: z.number().int().min(1).max(8),
    handCount: z.number().int().nonnegative(),
    deckCount: z.number().int().nonnegative(),
    discardCount: z.number().int().nonnegative(),
    graveyardCount: z.number().int().nonnegative(),
    voteTargetId: z.string().nullable(),
    confirmed: z.boolean(),
    eventExcluded: z.boolean(),
  })).min(2).max(8),
  self: z.object({
    userId: z.string().min(1),
    status: z.enum(['active', 'dead']),
    hand: z.array(cardSchema).max(480),
  }),
  playedCards: z.array(cardSchema.extend({
    userId: z.string().min(1),
    username: z.string().min(1),
    color: playerColorSchema,
    playedOrder: z.number().nonnegative(),
  })),
  eventDiscardCards: z.array(cardSchema.extend({
    userId: z.string().min(1),
    username: z.string().min(1),
    color: playerColorSchema,
    playedOrder: z.number().nonnegative(),
  })),
  discardCards: z.array(cardSchema.extend({
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
    event_already_confirmed: 'You already confirmed this event.',
    event_not_voting: 'Voting for this event has already closed.',
    active_player_required: 'Only surviving players can take that action.',
    select_event_cards: 'Choose at least one eligible card to discard.',
    event_does_not_discard: 'This event does not accept discarded cards.',
    card_not_event_eligible: 'That card is not eligible for this event.',
    event_not_confirming: 'This event is not ready for confirmation yet.',
    eligible_cards_remain: 'Play or discard every highlighted card before confirming.',
    invalid_power_cost: 'Select exactly the number of cards shown for this power.',
    match_not_accepting_powers: 'Class powers cannot be used while the dungeon is resolving.',
    active_target_required: 'Choose a surviving player.',
    event_required: 'The Champion can only exclude someone during an event.',
    event_player_excluded: 'That player is excluded from this event.',
    timer_already_frozen: 'Time is already frozen.',
    power_not_available: 'That class power cannot affect this card.',
    time_freeze_lockout: 'Time was just frozen. Wait for the party notification before playing.',
    run_time_expired: 'The five-minute dungeon timer has expired.',
    use_special_card_action: 'Open the special card to choose its effect.',
    special_card_required: 'Choose a special card from your hand.',
    special_not_available: 'This special card cannot defeat the current encounter.',
    invalid_special_symbols: 'Choose exactly three symbols.',
    invalid_special_mode: 'Choose a blessing effect.',
    invalid_special_target: 'This card does not accept that target.',
    other_player_required: 'Choose another player in this match.',
    not_enough_deck_to_share: 'You need at least 2 cards remaining in your deck to share half.',
  };
  const key = Object.keys(errors).find(error => message.includes(error));
  return key ? errors[key] : 'The game could not complete that action. Please try again.';
}
