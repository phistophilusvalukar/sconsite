export const hasAuthIdentityChanged = (currentUserId: string | null, nextUserId: string | null): boolean =>
  currentUserId !== nextUserId;

