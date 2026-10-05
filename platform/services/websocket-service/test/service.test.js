import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { io as createClient } from 'socket.io-client';
import { createWebSocketService, validateAllowedOrigins } from '../src/service.js';

const silentLogger = { info() {}, error() {} };

test('serves health and the browser chat client', async (context) => {
  const running = await startService();
  context.after(() => running.close());

  const healthResponse = await fetch(`${running.url}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    status: 'ok',
    service: 'websocket-service',
    connectedClients: 0
  });

  const clientResponse = await fetch(running.url);
  assert.equal(clientResponse.status, 200);
  assert.match(await clientResponse.text(), /Platform Chat/);
});

test('broadcasts a message between two clients and retains history', async (context) => {
  const running = await startService();
  const alice = createSocket(running.url, 'alice');
  const bob = createSocket(running.url, 'bob');
  context.after(async () => {
    alice.close();
    bob.close();
    await running.close();
  });
  await Promise.all([waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect')]);

  const received = waitForEvent(bob, 'chat:message');
  const acknowledgement = await emitWithAcknowledgement(alice, 'chat:message', ' hello ');
  const message = await received;
  assert.equal(acknowledgement.ok, true);
  assert.equal(message.username, 'alice');
  assert.equal(message.text, 'hello');

  const charlie = createSocket(running.url, 'charlie');
  context.after(() => charlie.close());
  const history = waitForEvent(charlie, 'chat:history');
  await waitForEvent(charlie, 'connect');
  assert.equal((await history).at(-1).text, 'hello');
});

test('updates the username before broadcasting and rejects invalid messages', async (context) => {
  const running = await startService();
  const sender = createSocket(running.url, 'initial-name');
  const receiver = createSocket(running.url, 'receiver');
  context.after(async () => {
    sender.close();
    receiver.close();
    await running.close();
  });
  await Promise.all([waitForEvent(sender, 'connect'), waitForEvent(receiver, 'connect')]);

  const usernameResult = await emitWithAcknowledgement(sender, 'chat:username', 'updated-name');
  assert.deepEqual(usernameResult, { ok: true, username: 'updated-name' });
  const rejected = await emitWithAcknowledgement(sender, 'chat:message', '   ');
  assert.equal(rejected.ok, false);

  const received = waitForEvent(receiver, 'chat:message');
  await emitWithAcknowledgement(sender, 'chat:message', 'valid message');
  assert.equal((await received).username, 'updated-name');
});

test('ignores a non-function acknowledgement without crashing', async (context) => {
  const running = await startService();
  const client = createSocket(running.url, 'malformed-client');
  context.after(async () => {
    client.close();
    await running.close();
  });
  await waitForEvent(client, 'connect');
  const received = waitForEvent(client, 'chat:message');
  client.emit('chat:message', 'still valid', 'not-a-callback');
  assert.equal((await received).text, 'still valid');
  assert.equal((await fetch(`${running.url}/health`)).status, 200);
});

test('bounds retained history to the configured limit', async (context) => {
  const running = await startService({ historyLimit: 2 });
  const sender = createSocket(running.url, 'sender');
  context.after(async () => {
    sender.close();
    await running.close();
  });
  await waitForEvent(sender, 'connect');
  for (const message of ['one', 'two', 'three']) {
    await emitWithAcknowledgement(sender, 'chat:message', message);
  }

  const reader = createSocket(running.url, 'reader');
  context.after(() => reader.close());
  const history = waitForEvent(reader, 'chat:history');
  await waitForEvent(reader, 'connect');
  assert.deepEqual((await history).map((message) => message.text), ['two', 'three']);
});

test('returns 400 for a malformed request target and stays healthy', async (context) => {
  const running = await startService();
  context.after(() => running.close());
  const port = Number(new URL(running.url).port);
  const response = await sendRawRequest(port, 'GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
  assert.match(response, /^HTTP\/1\.1 400/);
  assert.equal((await fetch(`${running.url}/health`)).status, 200);
});

test('client automatically reconnects after its transport closes', async (context) => {
  const running = await startService();
  const client = createSocket(running.url, 'reconnect-client');
  context.after(async () => {
    client.close();
    await running.close();
  });
  await waitForEvent(client, 'connect');
  const firstSocketId = client.id;
  const reconnected = waitForEvent(client, 'connect', 5000);
  client.io.engine.close();
  await reconnected;
  assert.equal(client.connected, true);
  assert.notEqual(client.id, firstSocketId);
});

test('enforces configured Socket.IO origins', async (context) => {
  const running = await startService({ allowedOrigins: ['https://allowed.example'] });
  context.after(() => running.close());
  const blocked = createSocket(running.url, 'blocked', 'https://blocked.example');
  context.after(() => blocked.close());
  await assert.rejects(waitForEvent(blocked, 'connect', 500), /Timed out/);

  const allowed = createSocket(running.url, 'allowed', 'https://allowed.example');
  context.after(() => allowed.close());
  await waitForEvent(allowed, 'connect');
  assert.equal(allowed.connected, true);
});

test('rejects wildcard or non-HTTPS Socket.IO origins in production', () => {
  assert.throws(() => validateAllowedOrigins(['*'], 'production'), /canonical HTTPS origins/);
  assert.throws(() => validateAllowedOrigins(['http://chat.example.com'], 'production'), /canonical HTTPS origins/);
  assert.doesNotThrow(() => validateAllowedOrigins(['https://chat.example.com'], 'production'));
});

async function startService(options = {}) {
  const service = createWebSocketService({ logger: silentLogger, ...options });
  await new Promise((resolve, reject) => {
    service.httpServer.once('error', reject);
    service.httpServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = service.httpServer.address();
  return { url: `http://127.0.0.1:${port}`, close: () => service.close() };
}

function sendRawRequest(port, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => socket.end(request));
    const chunks = [];
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => resolve(chunks.join('')));
    socket.on('error', reject);
  });
}

function createSocket(url, username, origin) {
  return createClient(url, {
    path: '/socket.io',
    auth: { username },
    transports: ['websocket'],
    reconnectionDelay: 20,
    randomizationFactor: 0,
    extraHeaders: origin ? { Origin: origin } : undefined
  });
}

function waitForEvent(emitter, eventName, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timeout);
      emitter.off(eventName, onEvent);
    }
    function onEvent(value) {
      cleanup();
      resolve(value);
    }
    emitter.on(eventName, onEvent);
  });
}

function emitWithAcknowledgement(socket, eventName, value) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName} acknowledgement`)), 2000);
    socket.emit(eventName, value, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}
