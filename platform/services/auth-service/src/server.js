import { createAuthService } from './auth.js';
import { createJsonLogger, createServer } from './http.js';

const port = Number(process.env.PORT || 3000);
const logger = createJsonLogger();

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

const authService = createAuthService();
const server = createServer({ authService, logger });

server.listen(port, '0.0.0.0', () => {
  logger.info({
    event: 'service_started',
    service: 'auth-service',
    port
  });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  logger.info({
    event: 'service_stopping',
    service: 'auth-service'
  });

  server.close(() => {
    process.exit(0);
  });
}
