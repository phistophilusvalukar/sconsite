export const SENTRY_COVER_QUESTIONS = [
  (time: string) => `Is this system time correct? ${time} [Y/N]`,
  () => 'Would you like assistance resolving display errors? [Y/N]',
  () => 'Should diagnostic messages remain visible? [Y/N]',
  () => 'Is this console currently attended? [Y/N]',
  () => 'Would you like SENTRY/9 to continue helping? [Y/N]',
] as const;

export const SENTRY_ADMIN_QUESTION = 'Allow SENTRY/9 administrative access?';

export function parseSentryConsent(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes') return true;
  if (normalized === 'n' || normalized === 'no') return false;
  return null;
}

export function getSentryCoverQuestion(index: number, time: string): string {
  return SENTRY_COVER_QUESTIONS[index % SENTRY_COVER_QUESTIONS.length](time);
}
