const PUBLIC_PREFIXES = [
  '/ticket-log',
  '/ticket-log-archive-data',
  '/rules',
  '/characters',
  '/citizens',
  '/guilds',
  '/db-admin',
  '/public/characters',
  '/assets',
  '/api',
  '/auth/callback',
  '/favicon',
  '/npc-placeholder.png',
  '/lockpicking-workbench.png',
  '/_redirects'
];

const ADMIN_PASSWORD = '5252';
const SUPPORT_USER = 'notadmin';
const SUPPORT_PASSWORD = 'badkobold';

export const config = {
  matcher: '/:path*'
};

export default function middleware(request: Request) {
  const url = new URL(request.url);

  if (url.pathname === '/ticket-logs') {
    return Response.redirect(new URL('/ticket-log', url), 307);
  }

  if (url.pathname === '/ticket-log-support-data' || url.pathname.startsWith('/ticket-log-support-data/')) {
    const authorization = request.headers.get('authorization') || '';

    if (isBasicAuthMatch(authorization, SUPPORT_USER, SUPPORT_PASSWORD)) {
      return undefined;
    }

    return new Response('Support ticket authentication required.', {
      status: 401,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'www-authenticate': 'Basic realm="SCON Support Tickets"'
      }
    });
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
  return pathname === '/'
    || PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isBasicAuthMatch(authorization: string, expectedUser: string, expectedPassword: string) {
  const credentials = getBasicAuthCredentials(authorization);
  return credentials?.username === expectedUser && credentials.password === expectedPassword;
}

function getBasicAuthPassword(authorization: string) {
  return getBasicAuthCredentials(authorization)?.password || '';
}

function getBasicAuthCredentials(authorization: string) {
  if (!authorization.startsWith('Basic ')) return null;

  try {
    const decoded = atob(authorization.slice('Basic '.length));
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}
