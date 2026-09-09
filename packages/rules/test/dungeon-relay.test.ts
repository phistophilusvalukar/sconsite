import { describe, expect, it } from "vitest";
import {
  allocateDungeonRelayMatches,
  canDungeonRelayClassEliminate,
  createDungeonRelayDeck,
  DUNGEON_RELAY_SYMBOLS,
  DUNGEON_RELAY_CLASSES,
  DUNGEON_RELAY_CLASS_DECKS,
  dungeonRelayCardSymbols,
  dungeonRelayDrawToFive,
  dungeonRelayRequirementTotal,
  dungeonRelayRequirementTotalForPosition,
  isDungeonRelayEventEligible,
  resolveDungeonRelayVote,
} from "../src/index.js";

describe("Dungeon Relay prototype rules", () => {
  it.each(DUNGEON_RELAY_CLASSES)("creates a deterministic 60-card %s deck with only class-color triples", classId => {
    const first = createDungeonRelayDeck(42, classId);
    const definition = DUNGEON_RELAY_CLASS_DECKS[classId];
    expect(first).toEqual(createDungeonRelayDeck(42, classId));
    expect(first).not.toEqual(createDungeonRelayDeck(43, classId));
    expect(first).toHaveLength(60);
    expect(new Set(first.map(card => card.id)).size).toBe(60);
    expect(first.filter(card => card.special === definition.special)).toHaveLength(definition.copies);
    expect(first.filter(card => !card.special && card.symbols === 3)).toHaveLength(3);
    expect(first.filter(card => !card.special && card.symbols === 3).every(card => card.symbol === definition.symbol)).toBe(true);
    for (const symbol of DUNGEON_RELAY_SYMBOLS) {
      expect(first.filter(card => !card.special && card.symbol === symbol && card.symbols === 2)).toHaveLength(3);
    }
  });

  it("matches mixed and repeated wildcard symbols without granting extra symbols", () => {
    const chosen = { sword: 1, arrow: 1, shield: 0, staff: 1, dagger: 0 };
    expect(allocateDungeonRelayMatches(chosen, [{ id: 'wild', symbol: 'dagger', symbols: 1, special: 'wild_three', chosenSymbols: chosen, playedOrder: 1 }]).defeated).toBe(true);
    expect(dungeonRelayCardSymbols({ symbol: 'dagger', symbols: 1, special: 'wild_three', chosenSymbols: { ...chosen, sword: 3, arrow: 0, staff: 0 } }).sword).toBe(3);
    expect(() => dungeonRelayCardSymbols({ symbol: 'dagger', symbols: 1, special: 'wild_three', chosenSymbols: { ...chosen, sword: 2 } })).toThrow();
  });

  it("gives Alchemist one of every color and effect-only specials no matching symbols", () => {
    const tokens = dungeonRelayCardSymbols({ symbol: 'arrow', symbols: 1, special: 'all_colors' });
    expect(tokens).toEqual({ sword: 1, arrow: 1, shield: 1, staff: 1, dagger: 1 });
    expect(dungeonRelayRequirementTotal(dungeonRelayCardSymbols({ symbol: 'shield', symbols: 1, special: 'slay_boss' }))).toBe(0);
    expect(allocateDungeonRelayMatches(tokens, [{ id: 'prism', symbol: 'arrow', symbols: 1, special: 'all_colors', playedOrder: 1 }]).defeated).toBe(true);
  });

  it("uses printed special symbols for discard events", () => {
    expect(isDungeonRelayEventEligible({ symbol: 'shield', symbols: 1, special: 'cleric_blessing' }, 'discard_shields')).toBe(false);
    expect(isDungeonRelayEventEligible({ symbol: 'arrow', symbols: 1, special: 'all_colors' }, 'discard_shields')).toBe(true);
    expect(isDungeonRelayEventEligible({ symbol: 'dagger', symbols: 1, special: 'wild_three' }, 'discard_multis')).toBe(true);
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
