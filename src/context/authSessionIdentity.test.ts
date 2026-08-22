import { describe, expect, it } from 'vitest';
import { hasAuthIdentityChanged } from './authSessionIdentity';

describe('hasAuthIdentityChanged', () => {
  it('preserves mounted pages when the same user receives a refreshed session', () => {
    expect(hasAuthIdentityChanged('user-1', 'user-1')).toBe(false);
  });

  it('resets user-scoped state for sign-in, sign-out, and account changes', () => {
    expect(hasAuthIdentityChanged(null, 'user-1')).toBe(true);
    expect(hasAuthIdentityChanged('user-1', null)).toBe(true);
    expect(hasAuthIdentityChanged('user-1', 'user-2')).toBe(true);
  });
});

