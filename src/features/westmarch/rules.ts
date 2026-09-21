import type { Contribution, WestmarchEvent } from './model';

// GM Core p.52, licensed rules reference: https://2e.aonprd.com/Rules.aspx?ID=2629
const LEVEL_DCS = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40] as const;
export function levelDc(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level > 20) throw new RangeError('Level must be an integer from 0 to 20.');
  return LEVEL_DCS[level];
}

/** Only completed aid counts. Inclusive cutoff makes same-time aid benefit main work. */
export function aidReduction(event: WestmarchEvent, contributions: Contribution[], at?: string): number {
  const cutoff = at === undefined ? Infinity : Date.parse(at);
  return event.definition.actions.filter(a => a.kind === 'aid').reduce((sum, action) => {
    const successes = contributions.filter(c => c.eventId === event.id && c.actionId === action.id && c.kind === 'aid' && c.status === 'completed' && c.success === true && Date.parse(c.endsAt) <= cutoff).length;
    return sum + (successes >= action.threshold ? action.reduction : 0);
  }, 0);
}

/** Preview only: server resolution is authoritative. Current policy uses total >= DC,
 * without natural-1/20 degree changes; modifiers and base DC are booking snapshots. */
export function pendingAssessment(contribution: Contribution, event: WestmarchEvent, allContributions: Contribution[]): { state: 'success' | 'potential' | 'failure'; dc: number; remaining: number; needed: number } {
  if (contribution.status === 'completed') {
    const dc = contribution.finalDc ?? contribution.baseDc;
    return { state: contribution.success ? 'success' : 'failure', dc, remaining: 0, needed: Math.max(0, dc - contribution.total) };
  }
  const reduction = contribution.kind === 'main' ? aidReduction(event, allContributions, contribution.endsAt) : 0;
  const dc = contribution.baseDc - reduction;
  const maximum = contribution.kind === 'main' ? event.definition.actions.filter(a => a.kind === 'aid').reduce((sum, a) => sum + a.reduction, 0) : 0;
  const remaining = Math.max(0, maximum - reduction);
  const needed = Math.max(0, dc - contribution.total);
  return { state: needed === 0 ? 'success' : needed <= remaining ? 'potential' : 'failure', dc, remaining, needed };
}

export function eventProgress(event: WestmarchEvent, contributions: Contribution[]): { successes: number; failures: number; total: number; percentage: number | null; meetsTarget: boolean; reduction: number } {
  const main = contributions.filter(c => c.eventId === event.id && c.kind === 'main' && c.status === 'completed');
  const successes = main.filter(c => c.success === true).length;
  const failures = main.filter(c => c.success === false).length;
  const total = successes + failures;
  const percentage = total === 0 ? null : successes / total * 100;
  return { successes, failures, total, percentage, meetsTarget: total >= event.definition.minimum && percentage !== null && percentage >= event.definition.target, reduction: aidReduction(event, contributions) };
}

/** Half-open intervals permit consecutive actions; invalid intervals are rejected. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const [as, ae, bs, be] = [aStart, aEnd, bStart, bEnd].map(Date.parse);
  if (![as, ae, bs, be].every(Number.isFinite) || as >= ae || bs >= be) throw new RangeError('Schedule intervals must have valid, increasing timestamps.');
  return as < be && bs < ae;
}

export function formatDuration(hours: number): string {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return [days ? `${days} ${days === 1 ? 'day' : 'days'}` : '', rest || !days ? `${rest} ${rest === 1 ? 'hour' : 'hours'}` : ''].filter(Boolean).join(' ');
}
