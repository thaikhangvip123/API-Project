import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const requireSocketIo = createRequire(new URL('../services/websocket-service/package.json', import.meta.url));
const requireWebRtc = createRequire(new URL('../services/webrtc-signaling/package.json', import.meta.url));
const { io } = requireSocketIo('socket.io-client');
const { WebSocket } = requireWebRtc('ws');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1';
const smokeOrigin = process.env.SMOKE_ORIGIN;
const webhookSecret = process.env.WEBHOOK_SECRET;
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 10_000);
const suiteTimeoutMs = Number(process.env.SMOKE_SUITE_TIMEOUT_MS || 60_000);

if (!webhookSecret) {
  throw new Error('WEBHOOK_SECRET is required for the signed webhook smoke test');
}
if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0 || !Number.isInteger(suiteTimeoutMs) || suiteTimeoutMs <= 0) {
  throw new Error('Smoke-test timeouts must be positive integers');
}

const suiteTimeout = setTimeout(() => {
  console.error(`Smoke suite exceeded ${suiteTimeoutMs} ms`);
  process.exit(1);
}, suiteTimeoutMs);

const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const results = [];

await check('gateway health', async () => {
  const response = await timedFetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /gateway ok/);
});

await check('auth register, login, and verify', async () => {
  const credentials = {
    email: `step10-auth-${suffix}@example.test`,
    password: 'SmokePass123!',
    name: 'Step 10 Smoke'
  };
  assert.equal((await jsonRequest('/api/auth/register', { method: 'POST', body: credentials })).status, 201);
  const login = await jsonRequest('/api/auth/login', { method: 'POST', body: credentials });
  assert.equal(login.status, 200);
  assert.equal(typeof login.body.token, 'string');
  const verify = await jsonRequest('/api/auth/verify', {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(verify.status, 200);
  assert.equal(verify.body.valid, true);
});

let userId;
try {
  await check('user REST CRUD through gateway', async () => {
    const created = await jsonRequest('/api/users', {
      method: 'POST',
      body: { email: `step10-user-${suffix}@example.test`, name: 'Step 10 User' }
    });
    assert.equal(created.status, 201);
    userId = created.body.id;
    assert.equal((await jsonRequest(`/api/users/${userId}`)).body.id, userId);
    const updated = await jsonRequest(`/api/users/${userId}`, {
      method: 'PUT',
      body: { name: 'Step 10 Updated' }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, 'Step 10 Updated');
    const list = await jsonRequest('/api/users');
    assert.equal(list.status, 200);
    assert.ok(list.body.some((user) => user.id === userId));
  });

  await check('GraphQL REST-list and gRPC-single resolvers', async () => {
    const list = await jsonRequest('/graphql', {
      method: 'POST',
      body: { query: '{ users { id email name } }' }
    });
    assert.equal(list.status, 200);
    assert.ok(list.body.data.users.some((user) => user.id === userId));
    const single = await jsonRequest('/graphql', {
      method: 'POST',
      body: { query: 'query($id: Int!) { user(id: $id) { id email name } }', variables: { id: userId } }
    });
    assert.equal(single.status, 200);
    assert.equal(single.body.data.user.id, userId);
  });
} finally {
  if (userId !== undefined) {
    await check('delete smoke-test user', async () => {
      const response = await timedFetch(`${baseUrl}/api/users/${userId}`, { method: 'DELETE' });
      assert.equal(response.status, 204);
    });
  }
}

await check('Socket.IO two-client broadcast through /ws/', async () => {
  const options = {
    path: '/ws/socket.io',
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: smokeOrigin ? { Origin: smokeOrigin } : undefined
  };
  const first = io(baseUrl, options);
  const second = io(baseUrl, options);
  try {
    await Promise.all([once(first, 'connect'), once(second, 'connect')]);
    const received = once(second, 'chat:message');
    const acknowledged = withTimeout(
      new Promise((resolve) => first.emit('chat:message', `step10-${suffix}`, resolve)),
      requestTimeoutMs,
      'Socket.IO acknowledgement'
    );
    const [message, ack] = await Promise.all([received, acknowledged]);
    assert.equal(ack.ok, true);
    assert.equal(message.text, `step10-${suffix}`);
  } finally {
    first.close();
    second.close();
  }
});

await check('signed webhook acceptance, duplicate, and rejection', async () => {
  const rawBody = JSON.stringify({ event: 'step10.smoke', suffix });
  const signature = `sha256=${createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`;
  const eventId = `step10-${suffix}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Id': eventId,
    'X-Webhook-Signature': signature
  };
  assert.equal((await timedFetch(`${baseUrl}/webhook`, { method: 'POST', headers, body: rawBody })).status, 202);
  assert.equal((await timedFetch(`${baseUrl}/webhook`, { method: 'POST', headers, body: rawBody })).status, 200);
  assert.equal((await timedFetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: { ...headers, 'X-Webhook-Id': `${eventId}-bad`, 'X-Webhook-Signature': 'sha256=00' },
    body: rawBody
  })).status, 401);
});

await check('SOAP WSDL and NumberToWords through gateway', async () => {
  const wsdl = await timedFetch(`${baseUrl}/soap?wsdl`);
  assert.equal(wsdl.status, 200);
  assert.match(await wsdl.text(), /NumberToWords/);
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="urn:internship:soap:number-words">
  <soapenv:Body><tns:NumberToWords><tns:number>12045</tns:number></tns:NumberToWords></soapenv:Body>
</soapenv:Envelope>`;
  const response = await timedFetch(`${baseUrl}/soap`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: envelope
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /twelve thousand forty-five/i);
});

await check('WebRTC signaling join, offer, answer, and ICE', async () => {
  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/webrtc/signal';
  const first = await openWebSocket(wsUrl, smokeOrigin);
  const second = await openWebSocket(wsUrl, smokeOrigin);
  const firstMessages = collect(first);
  const secondMessages = collect(second);
  try {
    first.send(JSON.stringify({ type: 'join', roomId: `step10-${suffix}` }));
    await waitFor(firstMessages, (message) => message.type === 'joined');
    second.send(JSON.stringify({ type: 'join', roomId: `step10-${suffix}` }));
    await Promise.all([
      waitFor(firstMessages, (message) => message.type === 'peer-ready'),
      waitFor(secondMessages, (message) => message.type === 'peer-ready')
    ]);
    first.send(JSON.stringify({ type: 'offer', description: { type: 'offer', sdp: 'v=0\r\nstep10-offer' } }));
    await waitFor(secondMessages, (message) => message.type === 'offer');
    second.send(JSON.stringify({ type: 'answer', description: { type: 'answer', sdp: 'v=0\r\nstep10-answer' } }));
    await waitFor(firstMessages, (message) => message.type === 'answer');
    first.send(JSON.stringify({ type: 'ice-candidate', candidate: { candidate: 'candidate:step10', sdpMid: '0', sdpMLineIndex: 0 } }));
    await waitFor(secondMessages, (message) => message.type === 'ice-candidate');
  } finally {
    first.close();
    second.close();
  }
});

clearTimeout(suiteTimeout);
console.log(`Smoke tests passed: ${results.length}/${results.length}`);

async function check(name, action) {
  await action();
  results.push(name);
  console.log(`PASS ${name}`);
}

async function jsonRequest(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await timedFetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function once(emitter, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    emitter.once(event, (...args) => {
      clearTimeout(timeout);
      resolve(args.length === 1 ? args[0] : args);
    });
    emitter.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function openWebSocket(url, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, origin ? { origin } : undefined);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`Timed out opening WebSocket ${url}`));
    }, requestTimeoutMs);
    socket.once('open', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function collect(socket) {
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  return messages;
}

async function waitFor(messages, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = messages.find(predicate);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for WebSocket message: ${JSON.stringify(messages)}`);
}

function timedFetch(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(requestTimeoutMs) });
}

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timeout));
}
