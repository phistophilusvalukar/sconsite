import { z } from 'zod';
import {
  executeOuroboros,
  formatOuroborosFailure,
  type OuroborosLimits,
  type OuroValue,
} from './ouroborosRuntime';

const ouroValueSchema: z.ZodType<OuroValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(ouroValueSchema),
  z.record(z.string(), ouroValueSchema),
]));

const limitsSchema = z.object({
  maxSteps: z.number().int().positive().max(250_000).optional(),
  maxOutputCharacters: z.number().int().positive().max(65_536).optional(),
  maxCallDepth: z.number().int().positive().max(64).optional(),
}).strict();

const workerRequestSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().max(65_536),
  functionName: z.string().max(128).optional(),
  args: z.array(ouroValueSchema).max(32).optional(),
  globals: z.record(z.string(), ouroValueSchema).optional(),
  limits: limitsSchema.optional(),
}).strict();

self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = workerRequestSchema.safeParse(event.data);
  if (!parsed.success) {
    self.postMessage({
      id: 'invalid',
      ok: false,
      error: { kind: 'RuntimeError', message: 'invalid worker request', line: 1, column: 1 },
    });
    return;
  }

  const { id, source, functionName, args, globals, limits } = parsed.data;
  try {
    const result = executeOuroboros({
      source,
      functionName,
      args,
      globals,
      limits: limits as Partial<OuroborosLimits> | undefined,
    });
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: formatOuroborosFailure(error) });
  }
};

export {};
