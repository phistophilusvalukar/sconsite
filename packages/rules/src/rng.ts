/** Small, stable unsigned 32-bit PRNG. Never substitute ambient randomness. */
export function nextRandom(state: number): readonly [number, number] {
  let x = state >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  const next = x >>> 0;
  return [next / 0x1_0000_0000, next] as const;
}

export function shuffle<T>(values: readonly T[], seed: number): readonly [T[], number] {
  const result = [...values];
  let state = seed || 0x9e3779b9;
  for (let i = result.length - 1; i > 0; i--) {
    const [random, next] = nextRandom(state); state = next;
    const j = Math.floor(random * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return [result, state];
}
