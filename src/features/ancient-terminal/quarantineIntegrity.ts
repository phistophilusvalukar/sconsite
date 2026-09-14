export type QuarantineIntegrityEvent = {
  at: number;
  integrity: number;
};

export const QUARANTINE_WINDOW_MS = 5 * 60 * 1_000;

function createSeededInteger(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

export function buildQuarantineIntegritySchedule(
  expiresAt: number,
  duration = QUARANTINE_WINDOW_MS,
): QuarantineIntegrityEvent[] {
  const startedAt = expiresAt - duration;
  const nextInteger = createSeededInteger(expiresAt ^ Math.floor(expiresAt / 0x1_0000_0000));
  const drops: number[] = [];
  let remaining = 100;
  while (remaining > 15) {
    const largestDrop = Math.min(15, remaining - 5);
    const drop = 5 + (nextInteger() % (largestDrop - 4));
    drops.push(drop);
    remaining -= drop;
  }
  drops.push(remaining);

  const intervalWeights = drops.map(() => 55 + (nextInteger() % 91));
  const totalWeight = intervalWeights.reduce((total, weight) => total + weight, 0);
  const events: QuarantineIntegrityEvent[] = [{ at: startedAt, integrity: 100 }];
  let elapsedWeight = 0;
  let integrity = 100;
  drops.forEach((drop, index) => {
    elapsedWeight += intervalWeights[index];
    integrity -= drop;
    events.push({
      at: index === drops.length - 1 ? expiresAt : startedAt + Math.round(duration * elapsedWeight / totalWeight),
      integrity,
    });
  });
  return events;
}

export function getQuarantineIntegrity(schedule: readonly QuarantineIntegrityEvent[], now: number): number {
  let integrity = schedule[0]?.integrity ?? 0;
  for (const event of schedule) {
    if (event.at > now) break;
    integrity = event.integrity;
  }
  return integrity;
}
