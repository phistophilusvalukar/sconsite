import { describe, expect, it } from 'vitest';
import { arcanaDegree, glyphRevealCount, partialTranslation } from '../engine/arcanaChecks';

describe('arcana knowledge checks', () => {
  it('uses PF2e degree thresholds and natural die adjustments', () => {
    expect(arcanaDegree(10, 10, 20)).toBe('success');
    expect(arcanaDegree(20, 0, 25)).toBe('success');
    expect(arcanaDegree(1, 20, 20)).toBe('failure');
    expect(arcanaDegree(5, 0, 20)).toBe('critical_failure');
  });

  it('maps glyph outcomes to reveal counts', () => {
    expect(glyphRevealCount('critical_success')).toBe(5);
    expect(glyphRevealCount('success')).toBe(3);
    expect(glyphRevealCount('failure')).toBe(2);
    expect(glyphRevealCount('critical_failure')).toBe(1);
  });

  it('only translates fully on a critical success', () => {
    const inscription = 'Moon leads Tide, and Tide leads River.';
    expect(partialTranslation(inscription, 'critical_success')).toBe(inscription);
    expect(partialTranslation(inscription, 'success')).toContain('••••');
    expect(partialTranslation(inscription, 'failure')).toBeNull();
  });
});
