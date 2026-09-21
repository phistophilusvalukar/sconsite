import { describe, expect, it } from 'vitest';
import { addDays, calendarDays, commandSchema, moveDate, occursOn, type Task } from './model';
const task: Task = { id: '11111111-1111-4111-8111-111111111111', space_id: '22222222-2222-4222-8222-222222222222', title: 'Water plants', starts_on: '2024-01-31', recurrence: 'monthly' };
describe('planner date-only recurrence', () => {
  it('clamps monthly tasks to shorter months without losing their original anchor', () => {
    expect(occursOn(task, '2024-02-29')).toBe(true);
    expect(occursOn(task, '2025-02-28')).toBe(true);
    expect(occursOn(task, '2024-03-31')).toBe(true);
    expect(occursOn(task, '2024-03-29')).toBe(false);
    expect(occursOn(task, '2023-12-31')).toBe(false);
  });
  it('supports once, daily and weekly across DST and year boundaries', () => {
    expect(occursOn({ ...task, recurrence: 'once' }, '2024-02-29')).toBe(false);
    expect(occursOn({ ...task, recurrence: 'once' }, task.starts_on)).toBe(true);
    expect(occursOn({ ...task, recurrence: 'daily' }, '2024-03-10')).toBe(true);
    const weekly = { ...task, starts_on: '2024-12-29', recurrence: 'weekly' as const };
    expect(occursOn(weekly, '2025-01-05')).toBe(true);
    expect(occursOn(weekly, '2025-01-06')).toBe(false);
    expect(addDays('2024-03-10', 1)).toBe('2024-03-11');
  });
  it('builds complete Monday-first calendars and navigates months without skipping', () => {
    expect(calendarDays('2026-03-15', 'month')).toHaveLength(42);
    expect(calendarDays('2026-03-15', 'month')[0]).toBe('2026-02-23');
    expect(calendarDays('2026-09-21', 'week')).toEqual(['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27']);
    expect(moveDate('2026-01-31', 'month', 1)).toBe('2026-02-01');
    expect(moveDate('2026-01-01', 'month', -1)).toBe('2025-12-01');
  });
  it('rejects invalid external dates and empty names', () => {
    expect(commandSchema.safeParse({ type: 'save_task', spaceId: task.space_id, title: 'Test', startsOn: '2026-02-30', recurrence: 'monthly' }).success).toBe(false);
    expect(commandSchema.safeParse({ type: 'create_space', name: '   ', shared: false }).success).toBe(false);
  });
});
