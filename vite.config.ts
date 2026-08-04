import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SUPPORT_USER = 'notadmin';
const SUPPORT_PASSWORD = 'badkobold';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [supportTicketDevAuth(), react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});

function supportTicketDevAuth() {
  return {
    name: 'support-ticket-dev-auth',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url || '';
        if (requestUrl !== '/ticket-log-support-data' && !requestUrl.startsWith('/ticket-log-support-data/')) {
          next();
          return;
        }

        if (isSupportAuthMatch(request.headers.authorization || '')) {
          next();
          return;
        }

        response.statusCode = 401;
        response.setHeader('content-type', 'text/plain; charset=utf-8');
        response.setHeader('www-authenticate', 'Basic realm="SCON Support Tickets"');
        response.end('Support ticket authentication required.');
      });
    }
  };
}

function isSupportAuthMatch(authorization: string) {
  if (!authorization.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8');
    return decoded === `${SUPPORT_USER}:${SUPPORT_PASSWORD}`;
  } catch {
    return false;
  }
}
