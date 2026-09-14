import { describe, expect, it } from 'vitest';
import {
  QUARANTINE_WINDOW_MS,
  buildQuarantineIntegritySchedule,
  getQuarantineIntegrity,
} from './quarantineIntegrity';

describe('quarantine integrity schedule', () => {
  it('uses deterministic 5–15 point drops and reaches zero exactly at expiration', () => {
    const expiresAt = 2_000_000;
    const first = buildQuarantineIntegritySchedule(expiresAt);
    const second = buildQuarantineIntegritySchedule(expiresAt);
    expect(first).toEqual(second);
    expect(first[0]).toEqual({ at: expiresAt - QUARANTINE_WINDOW_MS, integrity: 100 });
    expect(first.at(-1)).toEqual({ at: expiresAt, integrity: 0 });
    for (let index = 1; index < first.length; index += 1) {
      const drop = first[index - 1].integrity - first[index].integrity;
      expect(drop).toBeGreaterThanOrEqual(5);
      expect(drop).toBeLessThanOrEqual(15);
      expect(first[index].at).toBeGreaterThan(first[index - 1].at);
    }
  });

  it('holds each displayed value until the next impact', () => {
    const schedule = buildQuarantineIntegritySchedule(5_000_000);
    const firstDrop = schedule[1];
    expect(getQuarantineIntegrity(schedule, firstDrop.at - 1)).toBe(100);
    expect(getQuarantineIntegrity(schedule, firstDrop.at)).toBe(firstDrop.integrity);
    expect(getQuarantineIntegrity(schedule, schedule.at(-1)!.at)).toBe(0);
  });
});
