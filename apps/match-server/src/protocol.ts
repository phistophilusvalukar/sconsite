import { z } from "zod";

export const commandEnvelopeSchema = z.object({
  commandId: z.string().uuid(),
  sequence: z.number().int().positive(),
  expectedRevision: z.number().int().nonnegative(),
  command: z.object({ type: z.string().min(1).max(64) }).passthrough(),
}).strict();
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

export type CommandReply =
  | { ok: true; commandId: string; revision: number; events: readonly unknown[] }
  | { ok: false; commandId?: string; code: "BAD_PAYLOAD"|"PAYLOAD_TOO_LARGE"|"RATE_LIMITED"|"DUPLICATE"|"OUT_OF_ORDER"|"STALE"|"ILLEGAL"|"UNAUTHENTICATED"; message: string; revision: number };

export function parsePayload(input: unknown, maxBytes = 16_384): CommandEnvelope {
  let size: number;
  try { size = Buffer.byteLength(JSON.stringify(input), "utf8"); }
  catch { throw new ProtocolError("BAD_PAYLOAD", "Payload is not serializable"); }
  if (size > maxBytes) throw new ProtocolError("PAYLOAD_TOO_LARGE", `Payload exceeds ${maxBytes} bytes`);
  const parsed = commandEnvelopeSchema.safeParse(input);
  if (!parsed.success) throw new ProtocolError("BAD_PAYLOAD", "Malformed command envelope");
  return parsed.data;
}

export class ProtocolError extends Error {
  constructor(public readonly code: Extract<CommandReply,{ok:false}>["code"], message: string) { super(message); }
}
