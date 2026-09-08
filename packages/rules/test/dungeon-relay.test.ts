import { describe, expect, it } from "vitest";
import {
  allocateDungeonRelayMatches,
  canDungeonRelayClassEliminate,
  createDungeonRelayDeck,
  DUNGEON_RELAY_SYMBOLS,
  dungeonRelayDrawToFive,
  dungeonRelayRequirementTotal,
  dungeonRelayRequirementTotalForPosition,
  isDungeonRelayEventEligible,
  resolveDungeonRelayVote,
} from "../src/index.js";

describe("Dungeon Relay prototype rules", () => {
  it("creates a deterministic, balanced 50-card deck", () => {
    const first = createDungeonRelayDeck(42);
    expect(first).toEqual(createDungeonRelayDeck(42));
    expect(first).not.toEqual(createDungeonRelayDeck(43));
    expect(first).toHaveLength(50);

    for (const symbol of DUNGEON_RELAY_SYMBOLS) {
      const cards = first.filter(card => card.symbol === symbol);
      expect(cards).toHaveLength(10);
      expect(cards.filter(card => card.symbols === 1)).toHaveLength(7);
      expect(cards.filter(card => card.symbols === 2)).toHaveLength(2);
      expect(cards.filter(card => card.symbols === 3)).toHaveLength(1);
    }
  });

  it("uses only the minimum symbols needed and ignores overplay", () => {
    const allocation = allocateDungeonRelayMatches(
      { sword: 0, arrow: 2, shield: 0, staff: 1, dagger: 0 },
      [
        { id: "arrow-one", symbol: "arrow", symbols: 1, playedOrder: 1 },
        { id: "staff-one", symbol: "staff", symbols: 1, playedOrder: 2 },
        { id: "extra-staff", symbol: "staff", symbols: 1, playedOrder: 3 },
        { id: "triple-arrow", symbol: "arrow", symbols: 3, playedOrder: 4 },
      ],
    );

    expect(allocation.defeated).toBe(true);
    expect(allocation.contributionByCardId).toEqual({
      "arrow-one": 1,
      "staff-one": 1,
      "extra-staff": 0,
      "triple-arrow": 1,
    });
    expect(dungeonRelayRequirementTotal(allocation.matched)).toBe(3);
  });

  it("does not defeat a dungeon with missing symbol types", () => {
    const allocation = allocateDungeonRelayMatches(
      { sword: 1, arrow: 0, shield: 0, staff: 1, dagger: 0 },
      [{ id: "many-swords", symbol: "sword", symbols: 3, playedOrder: 1 }],
    );
    expect(allocation.defeated).toBe(false);
    expect(allocation.matched).toMatchObject({ sword: 1, staff: 0 });
  });

  it("scales chambers and gives every boss exactly fifteen symbols", () => {
    expect(dungeonRelayRequirementTotalForPosition(2, 1)).toBe(4);
    expect(dungeonRelayRequirementTotalForPosition(2, 11)).toBe(15);
    expect(dungeonRelayRequirementTotalForPosition(8, 11)).toBe(15);
  });

  it("kills a player only when the deck cannot complete a required refill", () => {
    expect(dungeonRelayDrawToFive(3, 2)).toEqual({ drawCount: 2, dead: false });
    expect(dungeonRelayDrawToFive(2, 2)).toEqual({ drawCount: 2, dead: true });
    expect(dungeonRelayDrawToFive(0, 5)).toEqual({ drawCount: 5, dead: false });
    expect(dungeonRelayDrawToFive(0, 4)).toEqual({ drawCount: 4, dead: true });
    expect(dungeonRelayDrawToFive(10, 0)).toEqual({ drawCount: 0, dead: false });
  });

  it("identifies only cards eligible for discard events", () => {
    expect(isDungeonRelayEventEligible({ symbol: "shield", symbols: 1 }, "discard_shields")).toBe(true);
    expect(isDungeonRelayEventEligible({ symbol: "arrow", symbols: 2 }, "discard_shields")).toBe(false);
    expect(isDungeonRelayEventEligible({ symbol: "arrow", symbols: 2 }, "discard_multis")).toBe(true);
    expect(isDungeonRelayEventEligible({ symbol: "arrow", symbols: 1 }, "discard_multis")).toBe(false);
  });

  it("resolves event votes by majority and breaks ties by target seat", () => {
    const seats = { p1: 1, p2: 2, p3: 3 };
    expect(resolveDungeonRelayVote({ p1: "p2", p2: "p2", p3: "p1" }, seats)).toBe("p2");
    expect(resolveDungeonRelayVote({ p1: "p2", p2: "p1" }, seats)).toBe("p1");
  });

  it("matches elimination powers only to their class card type", () => {
    expect(canDungeonRelayClassEliminate("barbarian", "person")).toBe(true);
    expect(canDungeonRelayClassEliminate("ranger", "beast")).toBe(true);
    expect(canDungeonRelayClassEliminate("witch", "hazard")).toBe(true);
    expect(canDungeonRelayClassEliminate("rogue", "obstacle")).toBe(true);
    expect(canDungeonRelayClassEliminate("barbarian", "beast")).toBe(false);
    expect(canDungeonRelayClassEliminate("cleric", "person")).toBe(false);
  });
});
