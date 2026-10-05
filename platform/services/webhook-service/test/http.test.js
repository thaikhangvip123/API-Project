import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { createServer } from 'node:http';
import { createWebhookApp } from '../src/app.js';
import { createSignature } from '../src/signature.js';

const secret = 'test-webhook-secret';
const silentLogger = { info() {}, error() {} };

test('serves health and accepts a signed event once', async (context) => {
  const processed = [];
  const running = await startApp({ processEvent: async (event) => processed.push(event) });
  context.after(() => running.close());

  const healthResponse = await fetch(`${running.url}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: 'ok', service: 'webhook-service' });

  const payload = { event: 'demo.created', value: 42 };
  const accepted = await sendWebhook(running.url, { eventId: 'evt-1', payload });
  assert.equal(accepted.status, 202);
  assert.deepEqual(await accepted.json(), { status: 'accepted', eventId: 'evt-1', eventType: 'demo.created' });
  assert.equal(processed.length, 1);

  const duplicate = await sendWebhook(running.url, { eventId: 'evt-1', payload });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { status: 'duplicate', eventId: 'evt-1' });
  assert.equal(processed.length, 1);
});

test('rejects invalid signatures, content types, event IDs, and JSON', async (context) => {
  const running = await startApp();
  context.after(() => running.close());
  const rawBody = Buffer.from('{"event":"demo.created"}');

  const invalidSignature = await fetch(`${running.url}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Id': 'evt-invalid-signature', 'X-Webhook-Signature': createSignature('wrong-secret', rawBody) },
    body: rawBody
  });
  assert.equal(invalidSignature.status, 401);

  const invalidContentType = await fetch(`${running.url}/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Webhook-Id': 'evt-content-type' }, body: rawBody
  });
  assert.equal(invalidContentType.status, 415);

  const missingEventId = await fetch(`${running.url}/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': createSignature(secret, rawBody) }, body: rawBody
  });
  assert.equal(missingEventId.status, 400);

  const invalidJsonBody = Buffer.from('{');
  const invalidJson = await fetch(`${running.url}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Id': 'evt-invalid-json', 'X-Webhook-Signature': createSignature(secret, invalidJsonBody) },
    body: invalidJsonBody
  });
  assert.equal(invalidJson.status, 400);
});

test('releases the idempotency claim when event processing fails', async (context) => {
  let attempts = 0;
  const running = await startApp({ processEvent: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary failure');
  } });
  context.after(() => running.close());

  const first = await sendWebhook(running.url, { eventId: 'evt-retry', payload: { event: 'retry' } });
  assert.equal(first.status, 500);
  const retry = await sendWebhook(running.url, { eventId: 'evt-retry', payload: { event: 'retry' } });
  assert.equal(retry.status, 202);
  assert.equal(attempts, 2);
});

test('rejects payloads above the configured limit', async (context) => {
  const running = await startApp({ bodyLimitBytes: 16 });
  context.after(() => running.close());
  const response = await sendWebhook(running.url, { eventId: 'evt-large', payload: { event: 'large', value: 'x'.repeat(100) } });
  assert.equal(response.status, 413);
});

test('returns 503 instead of evicting an in-progress event at capacity', async (context) => {
  let releaseFirst;
  let markFirstStarted;
  const firstEventBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  const firstEventStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const running = await startApp({
    idempotencyMaxEntries: 1,
    processEvent: async ({ eventId }) => {
      if (eventId === 'evt-blocked') {
        markFirstStarted();
        await firstEventBlocked;
      }
    }
  });
  context.after(() => running.close());

  const firstRequest = sendWebhook(running.url, { eventId: 'evt-blocked', payload: { event: 'blocked' } });
  await firstEventStarted;
  const busyResponse = await sendWebhook(running.url, { eventId: 'evt-busy', payload: { event: 'busy' } });
  assert.equal(busyResponse.status, 503);
  releaseFirst();
  assert.equal((await firstRequest).status, 202);
});

test('returns retryable status for the same event while original processing later fails', async (context) => {
  let releaseFirst;
  let markFirstStarted;
  const firstEventBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  const firstEventStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const running = await startApp({ processEvent: async () => {
    markFirstStarted();
    await firstEventBlocked;
    throw new Error('original failed');
  } });
  context.after(() => running.close());

  const firstRequest = sendWebhook(running.url, { eventId: 'evt-concurrent', payload: { event: 'concurrent' } });
  await firstEventStarted;
  const duplicate = await sendWebhook(running.url, { eventId: 'evt-concurrent', payload: { event: 'concurrent' } });
  assert.equal(duplicate.status, 503);
  assert.equal(duplicate.headers.get('retry-after'), '1');
  releaseFirst();
  assert.equal((await firstRequest).status, 500);
});

test('rejects compressed content so signatures always cover transmitted raw bytes', async (context) => {
  const running = await startApp();
  context.after(() => running.close());
  const compressed = gzipSync(Buffer.from('{"event":"compressed"}'));
  const response = await fetch(`${running.url}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'X-Webhook-Id': 'evt-compressed',
      'X-Webhook-Signature': createSignature(secret, compressed)
    },
    body: compressed
  });
  assert.equal(response.status, 415);
});

async function startApp(options = {}) {
  const app = createWebhookApp({ secret, logger: silentLogger, ...options });
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function sendWebhook(url, { eventId, payload }) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return fetch(`${url}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Id': eventId, 'X-Webhook-Signature': createSignature(secret, rawBody) },
    body: rawBody
  });
}
