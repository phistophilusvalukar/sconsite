import { describe, expect, it } from 'vitest';
import { DEFAULT_STARTUP_SOURCE, parseStartupPlan } from './ancientTerminalStartup';

describe('Ancient Terminal startup script', () => {
  it('loads the default world initialization plan', () => {
    expect(parseStartupPlan(DEFAULT_STARTUP_SOURCE)).toEqual({
      ok: true,
      programs: [{ path: './world_init.oro', functions: ['getTime', 'getPop'] }],
    });
  });

  it('allows relative programs in other directories', () => {
    const result = parseStartupPlan(`fn startup():\n    return [{path: "../HOME/tools/test.oro", functions: ["main"]}]\n`);
    expect(result).toEqual({
      ok: true,
      programs: [{ path: '../HOME/tools/test.oro', functions: ['main'] }],
    });
  });

  it('rejects invalid startup entries', () => {
    const result = parseStartupPlan('fn startup():\n    return [{path: "clock.sys", functions: []}]\n');
    expect(result.ok).toBe(false);
  });
});
