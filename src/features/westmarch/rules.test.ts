import { describe, expect, it } from 'vitest';
import type { Contribution, WestmarchEvent } from './model';
import { aidReduction, eventProgress, formatDuration, levelDc, overlaps, pendingAssessment } from './rules';

const event: WestmarchEvent = {
  id: 'event', authorId: 'author', authorName: 'Author', status: 'active', revision: 1, createdAt: '2026-09-01T00:00:00Z', approvedAt: null, startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z', outcome: null, reviewNote: '',
  definition: { title: 'Crop plague', kind: 'minor', region: 'Vale', requester: 'Farmer', location: 'Fields', description: 'A blight spreads across the fields.', successText: 'The crops recover.', failureText: 'The harvest is lost.', durationHours: 720, target: 75, minimum: 4,
    actions: [
      { id: 'main', name: 'Restore crops', kind: 'main', description: '', skills: ['Nature'], hours: 24, adjustment: 0, threshold: 1, reduction: 2 },
      ...['search', 'study', 'curse'].map(id => ({ id, name: id, kind: 'aid' as const, description: '', skills: ['Perception' as const], hours: 1, adjustment: 0, threshold: 2, reduction: 2 })),
    ],
  },
};
function contribution(overrides: Partial<Contribution> = {}): Contribution {
  return { id: 'roll', eventId: event.id, characterId: 'hero', playerId: 'player', characterName: 'Hero', level: 6, actionId: 'main', kind: 'main', skill: 'Nature', modifier: 9, description: 'Restore the fields', die: 12, total: 21, baseDc: 22, finalDc: null, success: null, startsAt: '2026-09-02T00:00:00Z', endsAt: '2026-09-03T00:00:00Z', status: 'pending', ...overrides };
}
function aid(actionId: string, endsAt = '2026-09-02T00:00:00Z'): Contribution[] {
  return [1, 2].map(i => contribution({ id: `${actionId}-${i}`, kind: 'aid', actionId, endsAt, status: 'completed', success: true, finalDc: 22 }));
}

describe('Westmarch contribution projections', () => {
  it('uses the level DC table and rejects invalid levels', () => {
    expect([0, 1, 3, 6, 10, 20].map(levelDc)).toEqual([14, 15, 18, 22, 27, 40]);
    for (const level of [-1, 21, 1.5, NaN]) expect(() => levelDc(level)).toThrow(RangeError);
  });
  it('stacks independent aid tracks once and excludes pending, failed, void and foreign work', () => {
    const good = [...aid('search'), ...aid('study'), ...aid('curse')];
    expect(aidReduction(event, good)).toBe(6);
    expect(aidReduction(event, [...good, ...aid('search')])).toBe(6);
    for (const override of [{ status: 'pending' as const }, { status: 'void' as const }, { success: false }, { eventId: 'other' }]) {
      expect(aidReduction(event, aid('search').map(c => ({ ...c, ...override })))).toBe(0);
    }
    expect(aidReduction(event, aid('search').slice(0, 1))).toBe(0);
  });
  it('includes same-time aid but never aid completed after the main action', () => {
    const main = contribution();
    expect(pendingAssessment(main, event, aid('search', main.endsAt))).toMatchObject({ state: 'success', dc: 20 });
    expect(pendingAssessment(main, event, aid('search', '2026-09-03T00:00:01Z'))).toMatchObject({ state: 'potential', dc: 22 });
  });
  it('shows potential across all remaining bonuses without changing snapshot values', () => {
    const main = contribution({ total: 17 });
    expect(pendingAssessment(main, event, [])).toEqual({ state: 'potential', dc: 22, remaining: 6, needed: 5 });
    expect(pendingAssessment(main, event, aid('search'))).toEqual({ state: 'potential', dc: 20, remaining: 4, needed: 3 });
    expect(pendingAssessment(main, event, [...aid('search'), ...aid('study'), ...aid('curse')])).toMatchObject({ state: 'success', dc: 16 });
    expect(main.baseDc).toBe(22);
    expect(pendingAssessment(contribution({ total: 15 }), event, [])).toMatchObject({ state: 'failure' });
  });
  it('does not improve aid DCs and preserves completed outcomes against later bonuses', () => {
    expect(pendingAssessment(contribution({ kind: 'aid' }), event, aid('search'))).toEqual({ state: 'failure', dc: 22, remaining: 0, needed: 1 });
    expect(pendingAssessment(contribution({ status: 'completed', success: false, finalDc: 22 }), event, aid('search'))).toMatchObject({ state: 'failure', dc: 22, remaining: 0 });
  });
  it('counts finalized main work only, enforces minimum participation, and has no empty victory', () => {
    expect(eventProgress(event, [])).toMatchObject({ total: 0, percentage: null, meetsTarget: false });
    const success = contribution({ status: 'completed', success: true });
    expect(eventProgress(event, [success])).toMatchObject({ percentage: 100, meetsTarget: false });
    const rows = [success, success, success, contribution({ status: 'completed', success: false }), contribution(), ...aid('search')];
    expect(eventProgress(event, rows)).toEqual({ successes: 3, failures: 1, total: 4, percentage: 75, meetsTarget: true, reduction: 2 });
  });
  it('permits back-to-back work but catches overlap across timezones and rejects invalid ranges', () => {
    expect(overlaps('2026-09-01T00:00Z', '2026-09-02T00:00Z', '2026-09-02T00:00Z', '2026-09-03T00:00Z')).toBe(false);
    expect(overlaps('2026-09-01T00:00Z', '2026-09-02T00:00Z', '2026-09-01T16:00-07:00', '2026-09-03T00:00Z')).toBe(true);
    expect(() => overlaps('bad', 'bad', 'bad', 'bad')).toThrow();
    expect(() => overlaps('2026-09-02', '2026-09-01', '2026-09-01', '2026-09-03')).toThrow();
  });
  it('explains hour and day costs without implying extra rolls', () => {
    expect([1, 3, 24, 49, 168].map(formatDuration)).toEqual(['1 hour', '3 hours', '1 day', '2 days 1 hour', '7 days']);
  });
});
