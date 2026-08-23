import { describe, expect, it } from 'vitest';
import { assuranceDc, emptyBonus, totalBonus } from './types';

describe('marketplace skill modifiers', () => {
  it('combines the Foundry level, selected proficiency, and disclosed modifiers', () => {
    expect(totalBonus({ level: 9, proficiency: 'master', ability: 4, item: 2, circumstance: 1, status: 1 })).toBe(23);
  });

  it('uses only level and proficiency for Assurance', () => {
    expect(assuranceDc({ level: 9, proficiency: 'expert', ability: 4, item: 2, circumstance: 1, status: 1 })).toBe(23);
  });

  it('defaults new bonus disclosures to untrained', () => {
    expect(emptyBonus(7)).toEqual({ level: 7, proficiency: 'untrained', ability: 0, item: 0, circumstance: 0, status: 0 });
  });
});
