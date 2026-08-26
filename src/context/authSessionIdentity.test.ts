import { describe, expect, it } from 'vitest';
import { hasAuthIdentityChanged, supersedesInitialSessionLookup } from './authSessionIdentity';

describe('hasAuthIdentityChanged', () => {
  it('preserves mounted pages when the same user receives a refreshed session', () => {
    expect(hasAuthIdentityChanged('user-1', 'user-1')).toBe(false);
  });

  it('resets user-scoped state for sign-in, sign-out, and account changes', () => {
    expect(hasAuthIdentityChanged(null, 'user-1')).toBe(true);
    expect(hasAuthIdentityChanged('user-1', null)).toBe(true);
    expect(hasAuthIdentityChanged('user-1', 'user-2')).toBe(true);
  });

  it('lets the persisted-session lookup resolve initial hydration without overwriting newer auth changes', () => {
    expect(supersedesInitialSessionLookup('INITIAL_SESSION')).toBe(false);
    expect(supersedesInitialSessionLookup('SIGNED_IN')).toBe(true);
    expect(supersedesInitialSessionLookup('SIGNED_OUT')).toBe(true);
    expect(supersedesInitialSessionLookup('TOKEN_REFRESHED')).toBe(true);
  });
});

