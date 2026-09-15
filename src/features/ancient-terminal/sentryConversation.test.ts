import { describe, expect, it } from 'vitest';
import { getSentryCoverQuestion, parseSentryConsent, SENTRY_COVER_QUESTIONS } from './sentryConversation';

describe('SENTRY/9 conversation', () => {
  it.each([
    ['Y', true],
    ['yes', true],
    [' N ', false],
    ['NO', false],
    ['maybe', null],
  ])('parses %s', (value, expected) => {
    expect(parseSentryConsent(value)).toBe(expected);
  });

  it('cycles harmless cover questions until consent is obtained', () => {
    expect(getSentryCoverQuestion(0, '03:17:09')).toContain('03:17:09');
    expect(getSentryCoverQuestion(SENTRY_COVER_QUESTIONS.length, '03:17:09'))
      .toBe(getSentryCoverQuestion(0, '03:17:09'));
  });
});
