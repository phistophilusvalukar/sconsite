const AUTH_RETURN_PATH_KEY = 'sconsite-auth-return-path';

function getSafeReturnPath(candidate: string | null | undefined) {
  return candidate?.startsWith('/')
    && !candidate.startsWith('//')
    && !candidate.startsWith('/auth/callback')
    ? candidate
    : null;
}

export function storeAuthReturnPath(returnTo?: string) {
  if (typeof window === 'undefined') return;

  const safeReturnPath = getSafeReturnPath(returnTo);
  try {
    if (safeReturnPath) {
      window.sessionStorage.setItem(AUTH_RETURN_PATH_KEY, safeReturnPath);
    } else {
      window.sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
    }
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function consumeAuthReturnPath(requestedPath?: string | null) {
  let storedPath: string | null = null;

  if (typeof window !== 'undefined') {
    try {
      storedPath = window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY);
      window.sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
    } catch {
      // Falling back to the homepage is safe when storage is unavailable.
    }
  }

  return getSafeReturnPath(requestedPath) || getSafeReturnPath(storedPath) || '/';
}
