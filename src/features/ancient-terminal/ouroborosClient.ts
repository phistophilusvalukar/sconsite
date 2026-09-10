import type { OuroborosFailure, OuroborosRequest, OuroborosResult } from './ouroborosRuntime';

export type OuroborosOutcome =
  | { ok: true; result: OuroborosResult }
  | { ok: false; error: OuroborosFailure };

export type OuroborosExecution = {
  promise: Promise<OuroborosOutcome>;
  cancel: () => void;
};

type WorkerResponse = ({ id: string; ok: true; result: OuroborosResult }
  | { id: string; ok: false; error: OuroborosFailure });

const failure = (message: string): OuroborosOutcome => ({
  ok: false,
  error: { kind: 'LimitError', message, line: 1, column: 1 },
});

export function startOuroborosExecution(request: OuroborosRequest, timeoutMs = 1_500): OuroborosExecution {
  const worker = new Worker(new URL('./ouroboros.worker.ts', import.meta.url), { type: 'module', name: 'ouroboros-runtime' });
  const id = crypto.randomUUID();
  const executionDeadline = Math.min(Math.max(timeoutMs, 100), 3_000);
  let settled = false;
  let settle: (outcome: OuroborosOutcome) => void = () => undefined;
  const promise = new Promise<OuroborosOutcome>(resolve => { settle = resolve; });
  const finish = (outcome: OuroborosOutcome) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    worker.terminate();
    settle(outcome);
  };
  const timer = window.setTimeout(() => finish(failure(`execution exceeded ${executionDeadline}ms`)), executionDeadline);

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    if (!event.data || event.data.id !== id) return;
    finish(event.data.ok
      ? { ok: true, result: event.data.result }
      : { ok: false, error: event.data.error });
  };
  worker.onerror = () => finish({
    ok: false,
    error: { kind: 'RuntimeError', message: 'runtime worker failed', line: 1, column: 1 },
  });
  worker.postMessage({ id, ...request });

  return {
    promise,
    cancel: () => finish(failure('execution interrupted')),
  };
}
