import type { GameCommand, PlayerId } from "@scon/rules";
import { clientCommandSchema, type ClientCommand, type GameCommandPayload } from "./schemas.js";

export function parseClientCommand(input: unknown): ClientCommand { return clientCommandSchema.parse(input); }

/** Authentication supplies playerId; it is intentionally never trusted from the payload. */
export function authorizeCommand(payload: GameCommandPayload, playerId: PlayerId): GameCommand {
  return { ...payload, playerId } as GameCommand;
}
