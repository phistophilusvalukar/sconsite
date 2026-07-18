import { z } from "zod";
import { EVENT_SCHEMA_VERSION, PROTOCOL_VERSION, SNAPSHOT_SCHEMA_VERSION } from "./version.js";

const id = z.string().min(1).max(128);
const uuidish = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const playerIdSchema = id;
export const cardInstanceIdSchema = id;
export const manaTraditionSchema = z.enum(["Arcane", "Divine", "Occult", "Primal", "Generic"]);
export const zoneSchema = z.enum(["deck", "hand", "fontRow", "creatureField", "supportField", "salvageField", "actionStack", "boneyard", "exile"]);
export const manaPoolSchema = z.object({ Arcane: z.number().int().nonnegative(), Divine: z.number().int().nonnegative(), Occult: z.number().int().nonnegative(), Primal: z.number().int().nonnegative(), Generic: z.number().int().nonnegative() }).strict();

const targetList = z.array(id).max(16).optional();
export const gameCommandPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLAY_CARD"), cardId: id, targets: targetList }).strict(),
  z.object({ type: z.literal("COMMIT_AS_FONT"), cardId: id }).strict(),
  z.object({ type: z.literal("ACTIVATE_FONT"), fontId: id, manaType: manaTraditionSchema }).strict(),
  z.object({ type: z.literal("ATTACK"), attackerId: id, targetId: id }).strict(),
  z.object({ type: z.literal("ACTIVATE_ABILITY"), sourceId: id, abilityId: id, targets: targetList }).strict(),
  z.object({ type: z.literal("EQUIP"), itemId: id, creatureId: id }).strict(),
  z.object({ type: z.literal("PASS_PRIORITY") }).strict(),
  z.object({ type: z.literal("END_TURN") }).strict(),
  z.object({ type: z.literal("CONCEDE") }).strict(),
]);
export const clientCommandSchema = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), matchId: uuidish, commandId: uuidish, sequence: z.number().int().nonnegative(), command: gameCommandPayloadSchema }).strict();

export const publicCardSchema = z.object({ id, definitionId: id.optional(), owner: id, controller: id, zone: zoneSchema.exclude(["deck", "hand", "actionStack"]), faceDown: z.boolean(), exhausted: z.boolean(), damage: z.number().int().nonnegative(), attackedThisTurn: z.boolean(), attachedTo: id.optional(), charges: z.number().int().nonnegative().optional() }).strict();
export const privateCardSchema = publicCardSchema.extend({ definitionId: id, zone: z.literal("hand") }).strict();
export const publicPlayerSchema = z.object({ id, life: z.number().int(), mana: manaPoolSchema, zoneCounts: z.object({ deck: z.number().int().nonnegative(), hand: z.number().int().nonnegative(), fontRow: z.number().int().nonnegative(), creatureField: z.number().int().nonnegative(), supportField: z.number().int().nonnegative(), salvageField: z.number().int().nonnegative(), boneyard: z.number().int().nonnegative(), exile: z.number().int().nonnegative() }).strict(), committedFontThisTurn: z.boolean() }).strict();
export const stackEntryViewSchema = z.object({ id, kind: z.enum(["card", "attack", "ability"]), controller: id, sourceId: id, targetId: id.optional(), countered: z.boolean() }).strict();
export const matchResultSchema = z.object({ winnerId: id.optional(), loserId: id, reason: z.enum(["life", "deck", "concession", "effect"]) }).strict();
export const publicSnapshotSchema = z.object({ schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION), rulesVersion: id, turn: z.number().int().positive(), activePlayer: id, priorityPlayer: id, consecutivePasses: z.number().int().nonnegative(), players: z.record(id, publicPlayerSchema), cards: z.record(id, publicCardSchema), stack: z.array(stackEntryViewSchema), result: matchResultSchema.optional() }).strict();
export const privateSnapshotSchema = z.object({ public: publicSnapshotSchema, viewerId: id, privateCards: z.record(id, privateCardSchema) }).strict();

const eventBase = { schemaVersion: z.literal(EVENT_SCHEMA_VERSION), eventIndex: z.number().int().nonnegative() } as const;
const event = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) => z.object({ ...eventBase, type: z.literal(type), ...shape }).strict();
export const gameEventSchema = z.discriminatedUnion("type", [
  event("TURN_STARTED", { playerId: id, turn: z.number().int().positive() }),
  event("CARD_DRAWN", { playerId: id, cardId: id.optional() }),
  event("CARD_MOVED", { instanceId: id, from: zoneSchema, to: zoneSchema }),
  event("FONT_COMMITTED", { playerId: id, instanceId: id }),
  event("MANA_GENERATED", { playerId: id, manaType: manaTraditionSchema, fontId: id }),
  event("MANA_SPENT", { playerId: id, cost: z.record(manaTraditionSchema, z.number().int().nonnegative()) }),
  event("CARD_PLAYED", { playerId: id, instanceId: id }),
  event("CREATURE_SUMMONED", { instanceId: id }),
  event("ATTACK_DECLARED", { attackerId: id, targetId: id }),
  event("DAMAGE_DEALT", { targetId: id, amount: z.number().int().nonnegative() }),
  event("HEALED", { targetId: id, amount: z.number().int().nonnegative() }),
  event("CREATURE_DESTROYED", { instanceId: id }),
  event("ITEM_DROPPED", { instanceId: id }),
  event("ITEM_EQUIPPED", { itemId: id, creatureId: id }),
  event("CONSUMABLE_USED", { consumableId: id, chargesRemaining: z.number().int().nonnegative() }),
  event("AURA_CREATED", { auraId: id }),
  event("AURA_DISPELLED", { auraId: id }),
  event("EFFECT_ADDED_TO_STACK", { effectId: id, sourceId: id }),
  event("EFFECT_RESOLVED", { effectId: id, countered: z.boolean() }),
  event("PRIORITY_PASSED", { playerId: id }),
  event("MATCH_ENDED", { winnerId: id, loserId: id, reason: z.enum(["life", "deck", "concession", "effect"]) }),
]);

export const errorCodeSchema = z.enum(["AUTH_REQUIRED", "AUTH_INVALID", "NOT_MATCH_MEMBER", "INVALID_MESSAGE", "PAYLOAD_TOO_LARGE", "RATE_LIMITED", "STALE_SEQUENCE", "DUPLICATE_COMMAND", "MATCH_NOT_FOUND", "MATCH_ENDED", "NO_PRIORITY", "ILLEGAL_TIMING", "ILLEGAL_CARD", "ILLEGAL_TARGET", "INSUFFICIENT_MANA", "INTERNAL_ERROR", "VERSION_MISMATCH"]);
export const protocolErrorSchema = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("ERROR"), code: errorCodeSchema, message: z.string().min(1).max(500), commandId: uuidish.optional(), retryable: z.boolean() }).strict();

export const matchmakingRequestSchema = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("MATCHMAKE"), deckId: uuidish, deckVersion: z.number().int().positive(), region: z.string().min(2).max(32).optional() }).strict();
export const matchmakingStatusSchema = z.discriminatedUnion("status", [
  z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("MATCHMAKING_QUEUED"), status: z.literal("queued"), ticketId: uuidish, queuedAt: z.string().datetime() }).strict(),
  z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("MATCHMAKING_MATCHED"), status: z.literal("matched"), ticketId: uuidish, matchId: uuidish, seat: z.union([z.literal(0), z.literal(1)]) }).strict(),
  z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("MATCHMAKING_CANCELLED"), status: z.literal("cancelled"), ticketId: uuidish }).strict(),
]);
export const reconnectRequestSchema = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("RECONNECT"), matchId: uuidish, lastEventIndex: z.number().int().min(-1), lastSequence: z.number().int().nonnegative(), reconnectToken: z.string().min(16).max(2048) }).strict();
export const reconnectResponseSchema = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("RECONNECTED"), matchId: uuidish, snapshot: privateSnapshotSchema, missedEvents: z.array(gameEventSchema).max(10000), nextSequence: z.number().int().nonnegative() }).strict();
export const snapshotMessageSchema = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("SNAPSHOT"), matchId: uuidish, snapshot: privateSnapshotSchema, eventIndex: z.number().int().min(-1) }).strict();
export const eventBatchMessageSchema = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("EVENT_BATCH"), matchId: uuidish, events: z.array(gameEventSchema).min(1).max(1000) }).strict();
export const commandAcceptedSchema = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("COMMAND_ACCEPTED"), matchId: uuidish, commandId: uuidish, sequence: z.number().int().nonnegative(), lastEventIndex: z.number().int().min(-1) }).strict();
export const serverMessageSchema = z.discriminatedUnion("type", [protocolErrorSchema, ...matchmakingStatusSchema.options, reconnectResponseSchema, snapshotMessageSchema, eventBatchMessageSchema, commandAcceptedSchema]);

export type GameCommandPayload = z.infer<typeof gameCommandPayloadSchema>;
export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;
export type PrivateSnapshot = z.infer<typeof privateSnapshotSchema>;
export type NetworkGameEvent = z.infer<typeof gameEventSchema>;
export type ProtocolError = z.infer<typeof protocolErrorSchema>;
export type MatchmakingRequest = z.infer<typeof matchmakingRequestSchema>;
export type MatchmakingStatus = z.infer<typeof matchmakingStatusSchema>;
export type ReconnectRequest = z.infer<typeof reconnectRequestSchema>;
export type ReconnectResponse = z.infer<typeof reconnectResponseSchema>;
export type SnapshotMessage = z.infer<typeof snapshotMessageSchema>;
export type EventBatchMessage = z.infer<typeof eventBatchMessageSchema>;
export type CommandAccepted = z.infer<typeof commandAcceptedSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
