const PUBLIC_PREFIXES = [
  '/ticket-log',
  '/ticket-log-archive-data',
  '/assets',
  '/api',
  '/auth/callback',
  '/favicon',
  '/npc-placeholder.png',
  '/lockpicking-workbench.png',
  '/_redirects'
];

const ADMIN_PASSWORD = '5252';

export const config = {
  matcher: '/((?!.*\\..*).*)'
};

export default function middleware(request: Request) {
  const url = new URL(request.url);

  if (url.pathname === '/' || url.pathname === '/ticket-logs') {
    return Response.redirect(new URL('/ticket-log', url), 307);
  }

  if (isPublicPath(url.pathname)) {
    return undefined;
  }

  const authorization = request.headers.get('authorization') || '';

  if (getBasicAuthPassword(authorization) === ADMIN_PASSWORD) {
    return undefined;
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'www-authenticate': 'Basic realm="SCON Admin"'
    }
  });
}

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getBasicAuthPassword(authorization: string) {
  if (!authorization.startsWith('Basic ')) return '';

  try {
    const decoded = atob(authorization.slice('Basic '.length));
    return decoded.slice(decoded.indexOf(':') + 1);
  } catch {
    return '';
  }
}
