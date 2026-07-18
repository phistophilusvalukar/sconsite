import { describe, expect, it } from "vitest";
import { createGame, type CardDefinition, type GameEvent } from "@scon/rules";
import { authorizeCommand, clientCommandSchema, gameEventSchema, matchmakingRequestSchema, projectEvents, projectPrivateState, projectPublicState, protocolErrorSchema, reconnectRequestSchema } from "../src/index.js";

const definitions: CardDefinition[] = [
  { id: "secret-a", name: "Secret A", type: "Creature", power: 1, health: 1 },
  { id: "secret-b", name: "Secret B", type: "Spell" },
];
const state = createGame({ seed: 8, definitions, players: [{ id: "alice", deck: ["secret-a", "secret-b"] }, { id: "bob", deck: ["secret-b", "secret-a"] }], startingHand: 1 }).state;

describe("strict network inputs", () => {
  const valid = { protocolVersion: 1, matchId: "match_123", commandId: "command_123", sequence: 0, command: { type: "END_TURN" } };
  it("accepts a versioned command envelope", () => expect(clientCommandSchema.parse(valid)).toEqual(valid));
  it("rejects unknown keys, invalid versions, and oversized targets", () => {
    expect(() => clientCommandSchema.parse({ ...valid, admin: true })).toThrow();
    expect(() => clientCommandSchema.parse({ ...valid, protocolVersion: 2 })).toThrow();
    expect(() => clientCommandSchema.parse({ ...valid, command: { type: "PLAY_CARD", cardId: "c1", targets: Array(17).fill("x") } })).toThrow();
  });
  it("binds identity from authentication, never client input", () => expect(authorizeCommand({ type: "END_TURN" }, "alice")).toEqual({ type: "END_TURN", playerId: "alice" }));
  it("validates matchmaking, reconnect, and errors strictly", () => {
    expect(matchmakingRequestSchema.safeParse({ protocolVersion: 1, type: "MATCHMAKE", deckId: "deck_123", deckVersion: 1 }).success).toBe(true);
    expect(reconnectRequestSchema.safeParse({ protocolVersion: 1, type: "RECONNECT", matchId: "match_123", lastEventIndex: -1, lastSequence: 0, reconnectToken: "0123456789abcdef" }).success).toBe(true);
    expect(protocolErrorSchema.safeParse({ protocolVersion: 1, type: "ERROR", code: "STALE_SEQUENCE", message: "stale", retryable: false }).success).toBe(true);
  });
});

describe("hidden-information projection", () => {
  it("public view exposes counts but neither hand identities nor deck order", () => {
    const view = projectPublicState(state); const encoded = JSON.stringify(view);
    expect(view.players.alice!.zoneCounts).toMatchObject({ hand: 1, deck: 1 });
    expect(Object.values(view.cards)).toHaveLength(0);
    expect(encoded).not.toContain(state.cards[state.players.alice!.zones.hand[0]!]!.definitionId);
    expect(encoded).not.toContain(state.players.bob!.zones.deck[0]!);
  });
  it("private view includes only the viewer's hand", () => {
    const view = projectPrivateState(state, "alice");
    expect(Object.keys(view.privateCards)).toEqual(state.players.alice!.zones.hand);
    expect(JSON.stringify(view)).not.toContain(state.cards[state.players.bob!.zones.hand[0]!]!.definitionId);
    expect(() => projectPrivateState(state, "spectator")).toThrow(/participant/);
  });
  it("face-down committed Fonts never reveal printed identity", () => {
    const handId = state.players.alice!.zones.hand[0]!;
    const player = state.players.alice!; const fontState = { ...state, cards: { ...state.cards, [handId]: { ...state.cards[handId]!, zone: "fontRow" as const, faceDown: true } }, players: { ...state.players, alice: { ...player, zones: { ...player.zones, hand: [], fontRow: [handId] } } } };
    expect(projectPublicState(fontState).cards[handId]!.definitionId).toBeUndefined();
  });
  it("redacts opponent draw identities while preserving event indices", () => {
    const events: GameEvent[] = [{ type: "CARD_DRAWN", playerId: "bob", cardId: "hidden" }, { type: "TURN_STARTED", playerId: "alice", turn: 2 }];
    expect(projectEvents(events, "alice", 10)[0]).toEqual({ type: "CARD_DRAWN", playerId: "bob", schemaVersion: 1, eventIndex: 10 });
    expect(projectEvents(events, "bob", 10)[0]).toMatchObject({ cardId: "hidden" });
  });
});

it("rejects malformed event shapes", () => expect(gameEventSchema.safeParse({ schemaVersion: 1, eventIndex: 0, type: "DAMAGE_DEALT", targetId: "p", amount: -1 }).success).toBe(false));
