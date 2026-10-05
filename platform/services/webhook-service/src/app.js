import express from 'express';
import { IdempotencyStore } from './idempotency.js';
import { verifySignature } from './signature.js';

export function createWebhookApp({
  secret,
  bodyLimitBytes = 1024 * 1024,
  idempotencyTtlMs = 24 * 60 * 60 * 1000,
  idempotencyMaxEntries = 10000,
  processEvent = async () => {},
  logger = createJsonLogger()
}) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('WEBHOOK_SECRET is required');
  }
  validatePositiveInteger(bodyLimitBytes, 'WEBHOOK_BODY_LIMIT_BYTES');
  const idempotencyStore = new IdempotencyStore({ ttlMs: idempotencyTtlMs, maxEntries: idempotencyMaxEntries });
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok', service: 'webhook-service' });
  });

  app.post('/webhook', requireJsonContentType, rejectContentEncoding, express.raw({ type: 'application/json', limit: bodyLimitBytes, inflate: false }), async (request, response) => {
    const eventId = readEventId(request);
    if (!eventId) {
      response.status(400).json({ error: 'X-Webhook-Id or X-GitHub-Delivery header is required' });
      return;
    }
    const signature = request.get('x-webhook-signature') || request.get('x-hub-signature-256');
    if (!verifySignature(secret, request.body, signature)) {
      logger.info({ event: 'signature_rejected', eventId });
      response.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(request.body.toString('utf8'));
    } catch {
      response.status(400).json({ error: 'Request body must be valid JSON' });
      return;
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      response.status(400).json({ error: 'Webhook payload must be a JSON object' });
      return;
    }

    const claimResult = idempotencyStore.claim(eventId);
    if (claimResult === 'completed') {
      logger.info({ event: 'duplicate_ignored', eventId });
      response.status(200).json({ status: 'duplicate', eventId });
      return;
    }
    if (claimResult === 'processing') {
      logger.info({ event: 'duplicate_processing', eventId });
      response.set('Retry-After', '1').status(503).json({ error: 'Webhook event is still processing; retry later' });
      return;
    }
    if (claimResult === 'full') {
      logger.error({ event: 'idempotency_capacity_reached', eventId });
      response.status(503).json({ error: 'Webhook service is busy; retry later' });
      return;
    }

    const eventType = readEventType(request, payload);
    try {
      await processEvent({ eventId, eventType, payload });
      idempotencyStore.complete(eventId);
      logger.info({ event: 'webhook_processed', eventId, eventType });
      response.status(202).json({ status: 'accepted', eventId, eventType });
    } catch (error) {
      idempotencyStore.release(eventId);
      logger.error({ event: 'webhook_processing_failed', eventId, eventType, error: error.message });
      response.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  app.use((error, request, response, _next) => {
    if (error?.type === 'entity.too.large') {
      response.status(413).json({ error: 'Webhook payload is too large' });
      return;
    }
    logger.error({ event: 'request_failed', method: request.method, path: request.path, error: error.message });
    response.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

function requireJsonContentType(request, response, next) {
  if (!request.is('application/json')) {
    response.status(415).json({ error: 'Content-Type must be application/json' });
    return;
  }
  next();
}

function rejectContentEncoding(request, response, next) {
  const encoding = request.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    response.status(415).json({ error: 'Compressed webhook payloads are not supported' });
    return;
  }
  next();
}

function readEventId(request) {
  const value = request.get('x-webhook-id') || request.get('x-github-delivery');
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) {
    return null;
  }
  return value;
}

function readEventType(request, payload) {
  const value = request.get('x-webhook-event') || request.get('x-github-event') || payload.event || 'unknown';
  return typeof value === 'string' ? value.slice(0, 100) : 'unknown';
}

function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

export function createJsonLogger() {
  function log(level, data) {
    const output = JSON.stringify({ level, timestamp: new Date().toISOString(), ...data });
    (level === 'error' ? console.error : console.log)(output);
  }
  return { info: (data) => log('info', data), error: (data) => log('error', data) };
}
