import { describe, expect, it } from "vitest";
import { cardDefinitionSchema, effectSchema, findCardVersion, findLatestCardVersion, GAME_GLOSSARY, prototypeCards, prototypeDecks, validateCardSet, validateDeck, type CardDefinition, type DeckDefinition } from "../src/index";

describe("prototype content", () => {
  it("contains the required 40-card distribution", () => {
    expect(prototypeCards).toHaveLength(40);
    expect(Object.fromEntries(["font", "creature", "spell", "aura", "magicItem", "consumable"].map((type) => [type, prototypeCards.filter((card) => card.type === type).length]))).toEqual({ font: 8, creature: 12, spell: 8, aura: 4, magicItem: 4, consumable: 4 });
  });
  it.each(prototypeCards.map((card) => [card.id, card] as const))("validates %s", (_id: string, card: CardDefinition) => {
    expect(cardDefinitionSchema.safeParse(card).success).toBe(true);
    expect(card.art.license.license).toBeTruthy();
    expect(card.sourceMetadata.attribution).toBeTruthy();
  });
  it("has unique versioned identities", () => expect(validateCardSet(prototypeCards).ok).toBe(true));
  it.each(prototypeDecks.map((deck) => [deck.id, deck] as const))("accepts legal deck %s", (_id: string, deck: DeckDefinition) => expect(validateDeck(deck, prototypeCards)).toMatchObject({ ok: true }));
  it("resolves pinned and latest versions", () => {
    expect(findCardVersion(prototypeCards, "spark-lance", 1)?.name).toBe("Spark Lance");
    expect(findLatestCardVersion(prototypeCards, "spark-lance")?.version).toBe(1);
  });
  it("defines every printed prototype keyword in the canonical glossary", () => {
    const terms = new Set(Object.values(GAME_GLOSSARY).map((entry) => entry.term.toLowerCase()));
    for (const card of prototypeCards) for (const keyword of card.keywords) expect(terms.has(keyword.toLowerCase())).toBe(true);
  });
  it("uses mixed target domains only for creature-or-player spells", () => {
    for (const id of ["spark-lance", "gentle-radiance"]) expect(prototypeCards.find((card) => card.id === id)?.targets[0]?.zone).toEqual(["creatureField", "player"]);
  });
  it("provides validated persistent metadata for every Aura", () => {
    for (const aura of prototypeCards.filter((card) => card.type === "aura")) expect(aura.persistentEffects.length).toBeGreaterThan(0);
  });
});

describe("safe declarative language", () => {
  it("accepts registered handlers but rejects arbitrary names", () => {
    expect(effectSchema.safeParse({ op: "runRegisteredEffect", handler: "prototype.rageBurst" }).success).toBe(true);
    expect(effectSchema.safeParse({ op: "runRegisteredEffect", handler: "global.eval" }).success).toBe(false);
  });
  it("rejects unknown executable fields", () => expect(effectSchema.safeParse({ op: "heal", target: "$target.0", amount: 2, script: "alert(1)" }).success).toBe(false));
  it("reports deck size, copy, and version errors", () => {
    const result = validateDeck({ id: "bad", version: 1, name: "Bad", format: "prototype-30", cards: [{ cardId: "bramble-runner", version: 99, count: 4 }] }, prototypeCards);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.message).join(" ")).toContain("unknown card version");
  });
});
