import { shuffle } from "./rng.js";

export const DUNGEON_RELAY_SYMBOLS = ["sword", "arrow", "shield", "staff", "dagger"] as const;
export type DungeonRelaySymbol = (typeof DUNGEON_RELAY_SYMBOLS)[number];
export const DUNGEON_RELAY_CARD_TYPES = ["obstacle", "person", "beast", "hazard", "mini_boss", "boss", "event"] as const;
export type DungeonRelayCardType = (typeof DUNGEON_RELAY_CARD_TYPES)[number];
export const DUNGEON_RELAY_EVENT_TYPES = ["discard_shields", "give_hands", "pass_left", "discard_multis"] as const;
export type DungeonRelayEventType = (typeof DUNGEON_RELAY_EVENT_TYPES)[number];
export const DUNGEON_RELAY_CLASSES = ["barbarian", "swashbuckler", "ranger", "alchemist", "rogue", "investigator", "wizard", "witch", "champion", "cleric"] as const;
export type DungeonRelayClass = (typeof DUNGEON_RELAY_CLASSES)[number];

export const DUNGEON_RELAY_CLASS_POWER_COST: Readonly<Record<DungeonRelayClass, number>> = {
  barbarian: 2,
  swashbuckler: 2,
  ranger: 2,
  alchemist: 1,
  rogue: 2,
  investigator: 2,
  wizard: 2,
  witch: 2,
  champion: 2,
  cleric: 4,
};

export const DUNGEON_RELAY_ELIMINATION_TYPES = {
  barbarian: "person",
  ranger: "beast",
  witch: "hazard",
  rogue: "obstacle",
} as const satisfies Partial<Record<DungeonRelayClass, DungeonRelayCardType>>;

export function canDungeonRelayClassEliminate(classId: DungeonRelayClass, cardType: DungeonRelayCardType): boolean {
  return classId in DUNGEON_RELAY_ELIMINATION_TYPES
    && DUNGEON_RELAY_ELIMINATION_TYPES[classId as keyof typeof DUNGEON_RELAY_ELIMINATION_TYPES] === cardType;
}

export interface DungeonRelayCard {
  readonly id: string;
  readonly symbol: DungeonRelaySymbol;
  readonly symbols: 1 | 2 | 3;
}

export type DungeonRelayRequirements = Readonly<Record<DungeonRelaySymbol, number>>;

export interface DungeonRelayPlayedCard extends DungeonRelayCard {
  readonly playedOrder: number;
}

export interface DungeonRelayMatchAllocation {
  readonly matched: DungeonRelayRequirements;
  readonly contributionByCardId: Readonly<Record<string, number>>;
  readonly defeated: boolean;
}

/** Builds the fixed 50-card prototype deck: 35 singles, 10 doubles, and 5 triples. */
export function createDungeonRelayDeck(seed: number): readonly DungeonRelayCard[] {
  const cards = DUNGEON_RELAY_SYMBOLS.flatMap(symbol => [
    ...Array.from({ length: 7 }, (_, index) => ({ id: `${symbol}-1-${index + 1}`, symbol, symbols: 1 as const })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `${symbol}-2-${index + 1}`, symbol, symbols: 2 as const })),
    { id: `${symbol}-3-1`, symbol, symbols: 3 as const },
  ]);
  return shuffle(cards, seed)[0];
}

export function emptyDungeonRelayRequirements(): Record<DungeonRelaySymbol, number> {
  return { sword: 0, arrow: 0, shield: 0, staff: 0, dagger: 0 };
}

/** Assigns only the minimum useful symbols from each card; excess symbols are intentionally ignored. */
export function allocateDungeonRelayMatches(
  required: DungeonRelayRequirements,
  playedCards: readonly DungeonRelayPlayedCard[],
): DungeonRelayMatchAllocation {
  const remaining = { ...required };
  const matched = emptyDungeonRelayRequirements();
  const contributionByCardId: Record<string, number> = {};

  [...playedCards]
    .sort((left, right) => left.playedOrder - right.playedOrder || left.id.localeCompare(right.id))
    .forEach(card => {
      const contribution = Math.min(card.symbols, remaining[card.symbol]);
      contributionByCardId[card.id] = contribution;
      matched[card.symbol] += contribution;
      remaining[card.symbol] -= contribution;
    });

  return {
    matched,
    contributionByCardId,
    defeated: DUNGEON_RELAY_SYMBOLS.every(symbol => remaining[symbol] === 0),
  };
}

export function dungeonRelayRequirementTotal(requirements: DungeonRelayRequirements): number {
  return DUNGEON_RELAY_SYMBOLS.reduce((total, symbol) => total + requirements[symbol], 0);
}

export function dungeonRelayRequirementTotalForPosition(playerCount: number, position: number): number {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) throw new Error("Dungeon Relay requires 2-8 players");
  if (!Number.isInteger(position) || position < 1 || position > 11) throw new Error("Dungeon position must be 1-11");
  return position === 11 ? 15 : playerCount * 2 + Math.floor((position - 1) / 4);
}

export function dungeonRelayDrawToFive(handCount: number, deckCount: number): Readonly<{ drawCount: number; dead: boolean }> {
  if (!Number.isInteger(handCount) || handCount < 0 || !Number.isInteger(deckCount) || deckCount < 0) {
    throw new Error("Invalid hand or deck count");
  }
  const needed = Math.max(0, 5 - handCount);
  return { drawCount: Math.min(needed, deckCount), dead: deckCount < needed };
}

export function isDungeonRelayEventEligible(card: Pick<DungeonRelayCard, "symbol" | "symbols">, eventType: DungeonRelayEventType): boolean {
  if (eventType === "discard_shields") return card.symbol === "shield";
  if (eventType === "discard_multis") return card.symbols > 1;
  return false;
}

export function resolveDungeonRelayVote(
  votes: Readonly<Record<string, string>>,
  seats: Readonly<Record<string, number>>,
): string | null {
  const targets = Object.values(votes);
  if (targets.length === 0) return null;
  const counts = targets.reduce<Record<string, number>>((result, target) => ({ ...result, [target]: (result[target] ?? 0) + 1 }), {});
  return Object.keys(counts).sort((left, right) =>
    (counts[right] ?? 0) - (counts[left] ?? 0) || (seats[left] ?? Number.MAX_SAFE_INTEGER) - (seats[right] ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right)
  )[0] ?? null;
}
