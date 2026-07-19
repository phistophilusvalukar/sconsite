import { describe, expect, it } from "vitest";
import { applyCommand, createGame, fontResources, type CardDefinition, type GameState, type Zone } from "../src/index.js";

const definitions: CardDefinition[] = [
  { id: "fodder", name: "Fodder", type: "Spell" },
  { id: "swift", name: "Swiftling", type: "Creature", cost: { Generic: 1 }, power: 2, health: 2, keywords: ["Swift"] },
  { id: "attacker", name: "Raider", type: "Creature", power: 4, health: 4 },
  { id: "trampler", name: "Ram", type: "Creature", power: 5, health: 5, keywords: ["Trample"] },
  { id: "blocker", name: "Wall", type: "Creature", power: 2, health: 3 },
  { id: "guard", name: "Sentinel", type: "Creature", power: 1, health: 5, keywords: ["Guard"] },
  { id: "spark", name: "Spark", type: "Spell", cost: { Generic: 1 }, target: "player", effects: [{ op: "damage", amount: 1 }] },
  { id: "growth", name: "Growth", type: "Spell", target: "creature", effects: [{ op: "modifyStats", power: 2, health: 2 }] },
  { id: "rally", name: "Rally", type: "Spell", target: "creature", effects: [{ op: "ready" }] },
  { id: "canopy-fury", name: "Canopy", type: "Aura" },
  { id: "season-of-thorns", name: "Season", type: "Aura" },
  { id: "hymn-of-returning-light", name: "Hymn", type: "Aura" },
  { id: "quieting-veil", name: "Veil", type: "Aura" },
];
const deck = Array.from({ length: 10 }, () => definitions.map((d) => d.id)).flat();
const base = (): GameState => createGame({ seed: 55, definitions, players: [{ id: "p1", deck }, { id: "p2", deck }], startingHand: 70 }).state;
const find = (s: GameState, player: string, definitionId: string, zone: Zone = "hand") => Object.values(s.cards).find((c) => c.owner === player && c.definitionId === definitionId && c.zone === zone)!.id;
function place(s: GameState, playerId: string, definitionId: string, zone: Exclude<Zone, "actionStack">, extra: Partial<GameState["cards"][string]> = {}): [GameState, string] {
  const id = find(s, playerId, definitionId); const player = s.players[playerId]!; const from = s.cards[id]!.zone as Exclude<Zone, "actionStack">;
  return [{ ...s, cards: { ...s.cards, [id]: { ...s.cards[id]!, zone, faceDown: false, ...extra } }, players: { ...s.players, [playerId]: { ...player, zones: { ...player.zones, [from]: player.zones[from].filter((x) => x !== id), [zone]: [...player.zones[zone], id] } } } }, id];
}
const run = (s: GameState, command: Parameters<typeof applyCommand>[1]) => applyCommand(s, command);
function resolve(s: GameState): GameState { s = run(s, { type: "PASS_PRIORITY", playerId: s.priorityPlayer }).state; return run(s, { type: "PASS_PRIORITY", playerId: s.priorityPlayer }).state; }

describe("automatic Font resources", () => {
  it("reports ready/total and exhausts a deterministic aggregate on cast", () => {
    let s = base(); let f1: string, f2: string; [s, f1] = place(s, "p1", "fodder", "fontRow", { faceDown: true }); [s, f2] = place(s, "p1", "fodder", "fontRow", { faceDown: true });
    expect(fontResources(s, "p1")).toMatchObject({ ready: 2, total: 2, byTradition: { Generic: 2 } });
    const swift = find(s, "p1", "swift"); const played = run(s, { type: "PLAY_CARD", playerId: "p1", cardId: swift });
    expect(played.state.cards[f1]!.exhausted || played.state.cards[f2]!.exhausted).toBe(true);
    expect(fontResources(played.state, "p1")).toMatchObject({ ready: 1, total: 2 });
  });
  it("makes Swift creatures ready immediately", () => { let s = base(); [s] = place(s, "p1", "fodder", "fontRow", { faceDown: true }); const id = find(s, "p1", "swift"); s = resolve(run(s, { type: "PLAY_CARD", playerId: "p1", cardId: id }).state); expect(s.cards[id]!.exhausted).toBe(false); });
});

describe("targeted creature effects", () => {
  it("applies a temporary stat boost to the chosen creature and clears it at turn end", () => {
    let s = base(); let creature: string; [s, creature] = place(s, "p1", "attacker", "creatureField");
    const growth = find(s, "p1", "growth"); s = resolve(run(s, { type: "PLAY_CARD", playerId: "p1", cardId: growth, targets: [creature] }).state);
    expect(s.cards[creature]).toMatchObject({ temporaryPower: 2, temporaryHealth: 2 });
    s = run(s, { type: "END_TURN", playerId: "p1" }).state;
    expect(s.cards[creature]!.temporaryPower).toBeUndefined(); expect(s.cards[creature]!.temporaryHealth).toBeUndefined();
  });
  it("readies the chosen creature", () => {
    let s = base(); let creature: string; [s, creature] = place(s, "p1", "attacker", "creatureField", { exhausted: true });
    const rally = find(s, "p1", "rally"); s = resolve(run(s, { type: "PLAY_CARD", playerId: "p1", cardId: rally, targets: [creature] }).state);
    expect(s.cards[creature]!.exhausted).toBe(false);
  });
});

describe("attack and defending priority", () => {
  it("allows an explicit blocker and resolves simultaneous clash with survivor damage cleared", () => {
    let s = base(); let attacker: string, blocker: string; [s, attacker] = place(s, "p1", "attacker", "creatureField"); [s, blocker] = place(s, "p2", "blocker", "creatureField");
    s = run(s, { type: "ATTACK", playerId: "p1", attackerId: attacker, targetId: "p2" }).state;
    expect(s.priorityPlayer).toBe("p2"); s = run(s, { type: "BLOCK", playerId: "p2", blockerId: blocker }).state; expect(s.priorityPlayer).toBe("p1"); s = resolve(s);
    expect(s.cards[blocker]!.zone).toBe("boneyard"); expect(s.cards[attacker]).toMatchObject({ zone: "creatureField", damage: 0 });
  });
  it("deals unblocked damage to the defending player", () => { let s = base(); let attacker: string; [s, attacker] = place(s, "p1", "attacker", "creatureField"); s = resolve(run(s, { type: "ATTACK", playerId: "p1", attackerId: attacker, targetId: "p2" }).state); expect(s.players.p2!.life).toBe(16); });
  it("requires an able Guard to block", () => { let s = base(); let attacker: string; [s, attacker] = place(s, "p1", "attacker", "creatureField"); [s] = place(s, "p2", "guard", "creatureField"); s = run(s, { type: "ATTACK", playerId: "p1", attackerId: attacker, targetId: "p2" }).state; expect(() => run(s, { type: "PASS_PRIORITY", playerId: "p2" })).toThrowError(/Guard/); });
  it("applies Trample excess to the player", () => { let s = base(); let attacker: string, blocker: string; [s, attacker] = place(s, "p1", "trampler", "creatureField"); [s, blocker] = place(s, "p2", "blocker", "creatureField"); s = run(s, { type: "ATTACK", playerId: "p1", attackerId: attacker, targetId: "p2" }).state; s = run(s, { type: "BLOCK", playerId: "p2", blockerId: blocker }).state; s = resolve(s); expect(s.players.p2!.life).toBe(18); });
});

describe("prototype Aura hooks", () => {
  it("Canopy grants friendly creatures +1 power", () => { let s = base(); let attacker: string; [s, attacker] = place(s, "p1", "attacker", "creatureField"); [s] = place(s, "p1", "canopy-fury", "supportField"); s = resolve(run(s, { type: "ATTACK", playerId: "p1", attackerId: attacker, targetId: "p2" }).state); expect(s.players.p2!.life).toBe(15); });
  it("Season damages only the first enemy attacker each turn", () => { let s = base(); let a1: string, a2: string; [s, a1] = place(s, "p1", "attacker", "creatureField"); [s, a2] = place(s, "p1", "trampler", "creatureField"); [s] = place(s, "p2", "season-of-thorns", "supportField"); let t = run(s, { type: "ATTACK", playerId: "p1", attackerId: a1, targetId: "p2" }); expect(t.events.some((e) => e.type === "AURA_TRIGGERED")).toBe(true); s = resolve(t.state); t = run(s, { type: "ATTACK", playerId: "p1", attackerId: a2, targetId: "p2" }); expect(t.events.some((e) => e.type === "AURA_TRIGGERED")).toBe(false); });
  it("Hymn heals its controller at turn start", () => { let s = base(); [s] = place(s, "p2", "hymn-of-returning-light", "supportField"); const p2 = s.players.p2!; s = { ...s, players: { ...s.players, p2: { ...p2, life: 17 } } }; s = run(s, { type: "END_TURN", playerId: "p1" }).state; expect(s.players.p2!.life).toBe(18); });
  it("Quieting taxes only the opponent's first spell each turn", () => { let s = base(); let f1: string, f2: string, f3: string; [s, f1] = place(s, "p1", "fodder", "fontRow", { faceDown: true }); [s, f2] = place(s, "p1", "fodder", "fontRow", { faceDown: true }); [s, f3] = place(s, "p1", "fodder", "fontRow", { faceDown: true }); [s] = place(s, "p2", "quieting-veil", "supportField"); const first = find(s, "p1", "spark"); let t = run(s, { type: "PLAY_CARD", playerId: "p1", cardId: first, targets: ["p2"] }); expect(t.events.filter((e) => e.type === "FONT_EXHAUSTED")).toHaveLength(2); s = resolve(t.state); const second = find(s, "p1", "spark"); t = run(s, { type: "PLAY_CARD", playerId: "p1", cardId: second, targets: ["p2"] }); expect(t.events.filter((e) => e.type === "FONT_EXHAUSTED")).toHaveLength(1); expect([f1, f2, f3].filter((id) => t.state.cards[id]!.exhausted)).toHaveLength(3); });
});
