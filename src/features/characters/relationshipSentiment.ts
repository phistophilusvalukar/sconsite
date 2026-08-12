import type { CharacterRelationshipSentiment } from '../../types/database';

export const MIN_RELATIONSHIP_SENTIMENT = -100;
export const MAX_RELATIONSHIP_SENTIMENT = 100;

export function clampRelationshipSentiment(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(MIN_RELATIONSHIP_SENTIMENT, Math.min(MAX_RELATIONSHIP_SENTIMENT, Math.round(value)));
}

export function getRelationshipSentimentCategory(value: number): CharacterRelationshipSentiment {
  const sentiment = clampRelationshipSentiment(value);
  if (sentiment < -15) return 'negative';
  if (sentiment > 15) return 'positive';
  return 'neutral';
}

export function getRelationshipSentimentLabel(value: number): string {
  const category = getRelationshipSentimentCategory(value);
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

export function getRelationshipColor(value: number): string {
  const sentiment = clampRelationshipSentiment(value);
  const negative = [255, 51, 79];
  const neutral = [255, 214, 51];
  const positive = [37, 232, 117];
  const start = sentiment <= 0 ? negative : neutral;
  const end = sentiment <= 0 ? neutral : positive;
  const progress = sentiment <= 0 ? (sentiment + 100) / 100 : sentiment / 100;
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * progress));
  return `rgb(${channels.join(', ')})`;
}
