import { shuffle } from "./rng.js";

export const DUNGEON_RELAY_SYMBOLS = ["sword", "arrow", "shield", "staff", "dagger"] as const;
export type DungeonRelaySymbol = (typeof DUNGEON_RELAY_SYMBOLS)[number];

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
  return position === 11 ? Math.max(10, playerCount * 3) : playerCount * 2 + Math.floor((position - 1) / 4);
}

export function dungeonRelayDrawToFive(handCount: number, deckCount: number): Readonly<{ drawCount: number; dead: boolean }> {
  if (!Number.isInteger(handCount) || handCount < 0 || handCount > 5 || !Number.isInteger(deckCount) || deckCount < 0) {
    throw new Error("Invalid hand or deck count");
  }
  const needed = 5 - handCount;
  return { drawCount: Math.min(needed, deckCount), dead: deckCount < needed };
}
