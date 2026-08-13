import { describe, expect, it } from 'vitest';
import { buildProfileBackground } from './profileBackground';

describe('profile background gradients', () => {
  it('keeps solid backgrounds unchanged', () => {
    expect(buildProfileBackground('#111111', 'solid', '#eeeeee', 'horizontal', 42)).toBe('#111111');
  });

  it('creates a hard center split at a zero transition rate', () => {
    expect(buildProfileBackground('#111111', 'gradient', '#eeeeee', 'horizontal', 0))
      .toBe('linear-gradient(90deg, #111111 0%, #111111 50%, #eeeeee 50%, #eeeeee 100%)');
  });

  it('uses the whole page for a full vertical transition', () => {
    expect(buildProfileBackground('#111111', 'gradient', '#eeeeee', 'vertical', 100))
      .toBe('linear-gradient(180deg, #111111 0%, #111111 0%, #eeeeee 100%, #eeeeee 100%)');
  });

  it('centers partial transitions and clamps unsafe values', () => {
    expect(buildProfileBackground('#111111', 'gradient', '#eeeeee', 'diagonal', 40))
      .toContain('#111111 30%, #eeeeee 70%');
    expect(buildProfileBackground('#111111', 'gradient', '#eeeeee', 'diagonal', 200))
      .toContain('#111111 0%, #eeeeee 100%');
  });
});
