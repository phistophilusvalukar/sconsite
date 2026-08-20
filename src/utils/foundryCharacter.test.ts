import { describe, expect, it } from 'vitest';
import { getAvatarObjectPosition } from './foundryCharacter';

describe('Foundry avatar alignment', () => {
  it('uses the top center crop by default', () => {
    expect(getAvatarObjectPosition()).toBe('50% 0%');
  });

  it('supports and safely bounds custom horizontal and vertical focus', () => {
    expect(getAvatarObjectPosition(25, 70)).toBe('25% 70%');
    expect(getAvatarObjectPosition(-10, 140)).toBe('0% 100%');
  });
});
