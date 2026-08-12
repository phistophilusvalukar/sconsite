import { describe, expect, it } from 'vitest';
import {
  clampRelationshipSentiment,
  getRelationshipColor,
  getRelationshipSentimentCategory
} from './relationshipSentiment';

describe('relationship sentiment', () => {
  it('clamps and rounds sentiment values', () => {
    expect(clampRelationshipSentiment(-130)).toBe(-100);
    expect(clampRelationshipSentiment(24.6)).toBe(25);
    expect(clampRelationshipSentiment(Number.NaN)).toBe(0);
  });

  it('uses a readable neutral band around the midpoint', () => {
    expect(getRelationshipSentimentCategory(-16)).toBe('negative');
    expect(getRelationshipSentimentCategory(-15)).toBe('neutral');
    expect(getRelationshipSentimentCategory(15)).toBe('neutral');
    expect(getRelationshipSentimentCategory(16)).toBe('positive');
  });

  it('interpolates from bright red through yellow to bright green', () => {
    expect(getRelationshipColor(-100)).toBe('rgb(255, 51, 79)');
    expect(getRelationshipColor(0)).toBe('rgb(255, 214, 51)');
    expect(getRelationshipColor(100)).toBe('rgb(37, 232, 117)');
  });
});
