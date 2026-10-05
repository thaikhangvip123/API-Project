import { createJsonLogger, createSignalingService, validateAllowedOrigins } from './service.js';

const port = readPositiveInteger('PORT', 3000, 65_535);
const maxConnections = readPositiveInteger('SIGNALING_MAX_CONNECTIONS', 1000, 100_000);
const maxPayloadBytes = readPositiveInteger('SIGNALING_MAX_PAYLOAD_BYTES', 65_536, 1_048_576);
const maxBufferedBytes = readPositiveInteger('SIGNALING_MAX_BUFFERED_BYTES', 262_144, 16_777_216);
const rateLimitMessages = readPositiveInteger('SIGNALING_RATE_LIMIT_MESSAGES', 120, 10_000);
const rateLimitWindowMs = readPositiveInteger('SIGNALING_RATE_LIMIT_WINDOW_MS', 10_000, 300_000);
const heartbeatMs = readPositiveInteger('SIGNALING_HEARTBEAT_MS', 30_000, 300_000);
const allowedOrigins = readList('SIGNALING_ALLOWED_ORIGINS', '*');
validateAllowedOrigins(allowedOrigins, process.env.NODE_ENV);
const stunUrls = readStunUrls();
const logger = createJsonLogger();
const service = createSignalingService({
  iceServers: [{ urls: stunUrls }],
  allowedOrigins,
  maxConnections,
  maxPayloadBytes,
  maxBufferedBytes,
  rateLimitMessages,
  rateLimitWindowMs,
  heartbeatMs,
  logger
});

service.httpServer.listen(port, '0.0.0.0', () => {
  logger.info({ event: 'service_started', service: 'webrtc-signaling', port, stunUrls });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ event: 'service_stopping', service: 'webrtc-signaling', signal });
  try {
    await service.close();
    process.exit(0);
  } catch (error) {
    logger.error({ event: 'service_stop_failed', error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function readPositiveInteger(name, fallback, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function readList(name, fallback) {
  const values = (process.env[name] || fallback).split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) {
    throw new Error(`${name} must contain at least one value`);
  }
  return values;
}

function readStunUrls() {
  const values = readList('STUN_URL', 'stun:stun.l.google.com:19302');
  if (values.some((value) => !/^stuns?:[^\s]{1,500}$/i.test(value))) {
    throw new Error('STUN_URL must contain comma-separated stun: or stuns: URLs');
  }
  return values;
}
