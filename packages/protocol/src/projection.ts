import type { CardInstance, GameEvent, GameState, PlayerId } from "@scon/rules";
import { EVENT_SCHEMA_VERSION, SNAPSHOT_SCHEMA_VERSION } from "./version.js";
import { gameEventSchema, privateSnapshotSchema, publicSnapshotSchema, type NetworkGameEvent, type PrivateSnapshot, type PublicSnapshot } from "./schemas.js";

const publicZones = new Set(["fontRow", "creatureField", "supportField", "salvageField", "boneyard", "exile"]);

function cardView(card: CardInstance): Record<string, unknown> {
  return {
    id: card.id,
    ...(!card.faceDown ? { definitionId: card.definitionId } : {}),
    owner: card.owner,
    controller: card.controller,
    zone: card.zone,
    faceDown: card.faceDown,
    exhausted: card.exhausted,
    damage: card.damage,
    attackedThisTurn: card.attackedThisTurn,
    ...(card.attachedTo ? { attachedTo: card.attachedTo } : {}),
    ...(card.charges !== undefined ? { charges: card.charges } : {}),
  };
}

/** Produces a spectator-safe view. No hand identities or deck order are present. */
export function projectPublicState(state: GameState): PublicSnapshot {
  const players = Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, {
    id: player.id,
    life: player.life,
    mana: player.mana,
    zoneCounts: {
      deck: player.zones.deck.length, hand: player.zones.hand.length, fontRow: player.zones.fontRow.length,
      creatureField: player.zones.creatureField.length, supportField: player.zones.supportField.length,
      salvageField: player.zones.salvageField.length, boneyard: player.zones.boneyard.length, exile: player.zones.exile.length,
    },
    committedFontThisTurn: player.committedFontThisTurn,
  }]));
  const cards = Object.fromEntries(Object.values(state.cards).filter((card) => publicZones.has(card.zone)).map((card) => [card.id, cardView(card)]));
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION, rulesVersion: state.rulesVersion, turn: state.turn,
    activePlayer: state.activePlayer, priorityPlayer: state.priorityPlayer, consecutivePasses: state.consecutivePasses,
    players, cards,
    stack: state.stack.map((entry) => ({
      id: entry.id, kind: entry.kind, controller: entry.controller, sourceId: entry.sourceId,
      ...(entry.targetId ? { targetId: entry.targetId } : {}), countered: entry.countered,
    })),
    ...(state.result ? { result: state.result } : {}),
  };
  return publicSnapshotSchema.parse(snapshot);
}

/** Adds only the viewer's hand identities. Deck order remains server-private for every viewer. */
export function projectPrivateState(state: GameState, viewerId: PlayerId): PrivateSnapshot {
  const viewer = state.players[viewerId];
  if (!viewer) throw new Error("Viewer is not a match participant");
  const privateCards = Object.fromEntries(viewer.zones.hand.map((cardId) => {
    const card = state.cards[cardId]!;
    return [cardId, { ...cardView(card), definitionId: card.definitionId }];
  }));
  return privateSnapshotSchema.parse({ public: projectPublicState(state), viewerId, privateCards });
}

/** Removes private draw identity from all viewers except the drawing player. */
export function projectEvents(events: readonly GameEvent[], viewerId: PlayerId, startIndex = 0): readonly NetworkGameEvent[] {
  return events.map((raw, offset) => {
    const source = raw.type === "CARD_DRAWN" && raw.playerId !== viewerId ? { ...raw, cardId: undefined } : raw;
    const clean = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
    return gameEventSchema.parse({ ...clean, schemaVersion: EVENT_SCHEMA_VERSION, eventIndex: startIndex + offset });
  });
}
