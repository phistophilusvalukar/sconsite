import type { ArcanaDegree } from './types';

export function arcanaDegree(dieRoll: number, modifier: number, dc: number): ArcanaDegree {
  const total = dieRoll + modifier;
  let rank = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (dieRoll === 20) rank = Math.min(3, rank + 1);
  if (dieRoll === 1) rank = Math.max(0, rank - 1);
  return (['critical_failure', 'failure', 'success', 'critical_success'] as const)[rank];
}

export function glyphRevealCount(degree: ArcanaDegree): number {
  return degree === 'critical_success' ? 5 : degree === 'success' ? 3 : degree === 'failure' ? 2 : 1;
}

export function partialTranslation(inscription: string, degree: ArcanaDegree): string | null {
  if (degree === 'critical_success') return inscription;
  if (degree !== 'success') return null;
  const words = inscription.match(/[\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+/gu) ?? [];
  let visible = 0;
  return words.map(token => {
    if (!/[\p{L}\p{N}]/u.test(token)) return token;
    visible += 1;
    return visible % 3 === 1 ? token : '••••';
  }).join('');
}
