export const hasAuthIdentityChanged = (currentUserId: string | null, nextUserId: string | null): boolean =>
  currentUserId !== nextUserId;

export const supersedesInitialSessionLookup = (authEvent: string): boolean =>
  authEvent !== 'INITIAL_SESSION';

