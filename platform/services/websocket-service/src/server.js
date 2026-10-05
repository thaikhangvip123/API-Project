import { createJsonLogger, createWebSocketService, validateAllowedOrigins } from './service.js';

const port = readPositiveInteger('PORT', 3000, 65535);
const historyLimit = readPositiveInteger('CHAT_HISTORY_LIMIT', 50);
const messageMaxLength = readPositiveInteger('CHAT_MESSAGE_MAX_LENGTH', 1000);
const allowedOrigins = parseList('SOCKET_IO_CORS_ORIGIN', '*');
validateAllowedOrigins(allowedOrigins, process.env.NODE_ENV);
const logger = createJsonLogger();
const service = createWebSocketService({
  allowedOrigins,
  historyLimit,
  messageMaxLength,
  logger
});

service.httpServer.listen(port, '0.0.0.0', () => {
  logger.info({ event: 'service_started', service: 'websocket-service', port });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ event: 'service_stopping', service: 'websocket-service', signal });
  try {
    await service.close();
    process.exit(0);
  } catch (error) {
    logger.error({ event: 'service_stop_failed', error: error.message });
    process.exit(1);
  }
}

function parseList(name, fallback) {
  const values = (process.env[name] || fallback).split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) {
    throw new Error(`${name} must contain at least one value`);
  }
  return values;
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
