import { createServer } from 'node:http';
import { createJsonLogger, createWebhookApp } from './app.js';

const port = readPositiveInteger('PORT', 3000, 65535);
const bodyLimitBytes = readPositiveInteger('WEBHOOK_BODY_LIMIT_BYTES', 1024 * 1024);
const idempotencyTtlSeconds = readPositiveInteger('WEBHOOK_IDEMPOTENCY_TTL_SECONDS', 86400);
const idempotencyMaxEntries = readPositiveInteger('WEBHOOK_IDEMPOTENCY_MAX_ENTRIES', 10000);
const secret = process.env.WEBHOOK_SECRET;
validateSecret(secret);

const logger = createJsonLogger();
const app = createWebhookApp({
  secret,
  bodyLimitBytes,
  idempotencyTtlMs: idempotencyTtlSeconds * 1000,
  idempotencyMaxEntries,
  logger,
  processEvent: async ({ eventId, eventType }) => logger.info({ event: 'demo_event_received', eventId, eventType })
});
const server = createServer(app);
server.listen(port, '0.0.0.0', () => logger.info({ event: 'service_started', service: 'webhook-service', port }));

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'service_stopping', service: 'webhook-service', signal });
  server.close((error) => {
    if (error) {
      logger.error({ event: 'service_stop_failed', error: error.message });
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function readPositiveInteger(name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function validateSecret(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('WEBHOOK_SECRET is required');
  }
  if (process.env.NODE_ENV === 'production' && (value.startsWith('change_me') || Buffer.byteLength(value) < 32)) {
    throw new Error('WEBHOOK_SECRET must be at least 32 bytes and not use the placeholder in production');
  }
}
