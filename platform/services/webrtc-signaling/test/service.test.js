import assert from 'node:assert/strict';
import net from 'node:net';
import { afterEach, describe, test } from 'node:test';
import { WebSocket } from 'ws';
import { createSignalingService, validateAllowedOrigins } from '../src/service.js';

const services = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
});

describe('WebRTC signaling service', () => {
  test('serves health, ICE configuration, and the browser client', async () => {
    const runtime = await startService();
    const health = await fetch(`${runtime.httpUrl}/health`).then((response) => response.json());
    const config = await fetch(`${runtime.httpUrl}/config`).then((response) => response.json());
    const page = await fetch(`${runtime.httpUrl}/`);

    assert.equal(health.status, 'ok');
    assert.deepEqual(config.iceServers, [{ urls: ['stun:example.test:3478'] }]);
    assert.match(await page.text(), /Signal Room/);
    assert.match(page.headers.get('content-security-policy'), /connect-src/);
  });

  test('pairs two peers and relays offer, answer, and ICE candidate', async () => {
    const runtime = await startService();
    const first = await connect(runtime.wsUrl);
    const second = await connect(runtime.wsUrl);
    const firstMessages = collect(first);
    const secondMessages = collect(second);

    first.send(JSON.stringify({ type: 'join', roomId: 'demo-room' }));
    await waitFor(firstMessages, (message) => message.type === 'joined');
    second.send(JSON.stringify({ type: 'join', roomId: 'demo-room' }));
    const firstReady = await waitFor(firstMessages, (message) => message.type === 'peer-ready');
    const secondReady = await waitFor(secondMessages, (message) => message.type === 'peer-ready');
    assert.equal(firstReady.initiator, true);
    assert.equal(secondReady.initiator, false);

    const offer = { type: 'offer', sdp: 'v=0\r\no=offer' };
    first.send(JSON.stringify({ type: 'offer', description: offer }));
    assert.deepEqual((await waitFor(secondMessages, (message) => message.type === 'offer')).description, offer);

    const answer = { type: 'answer', sdp: 'v=0\r\no=answer' };
    second.send(JSON.stringify({ type: 'answer', description: answer }));
    assert.deepEqual((await waitFor(firstMessages, (message) => message.type === 'answer')).description, answer);

    const candidate = { candidate: 'candidate:1 1 UDP 1 127.0.0.1 9999 typ host', sdpMid: '0', sdpMLineIndex: 0 };
    first.send(JSON.stringify({ type: 'ice-candidate', candidate }));
    assert.deepEqual((await waitFor(secondMessages, (message) => message.type === 'ice-candidate')).candidate, candidate);
  });

  test('rejects a third participant without disrupting the active room', async () => {
    const runtime = await startService();
    const peers = await Promise.all([connect(runtime.wsUrl), connect(runtime.wsUrl), connect(runtime.wsUrl)]);
    const messages = peers.map(collect);
    peers[0].send(JSON.stringify({ type: 'join', roomId: 'full-room' }));
    await waitFor(messages[0], (message) => message.type === 'joined');
    peers[1].send(JSON.stringify({ type: 'join', roomId: 'full-room' }));
    await waitFor(messages[1], (message) => message.type === 'joined');
    peers[2].send(JSON.stringify({ type: 'join', roomId: 'full-room' }));
    const error = await waitFor(messages[2], (message) => message.type === 'error');
    assert.equal(error.code, 'room_full');
    assert.equal(runtime.service.rooms.get('full-room').size, 2);
  });

  test('validates room IDs and signaling payloads', async () => {
    const runtime = await startService();
    const peer = await connect(runtime.wsUrl);
    const messages = collect(peer);
    peer.send('{');
    assert.equal((await waitFor(messages, (message) => message.code === 'invalid_json')).type, 'error');
    peer.send(JSON.stringify({ type: 'join', roomId: '../bad' }));
    assert.equal((await waitFor(messages, (message) => message.code === 'invalid_room')).type, 'error');
    peer.send(JSON.stringify({ type: 'offer', description: { type: 'offer', sdp: 'x' } }));
    assert.equal((await waitFor(messages, (message) => message.code === 'not_joined')).type, 'error');
  });

  test('notifies the remaining peer and permits a replacement participant', async () => {
    const runtime = await startService();
    const first = await connect(runtime.wsUrl);
    const second = await connect(runtime.wsUrl);
    const firstMessages = collect(first);
    const secondMessages = collect(second);
    first.send(JSON.stringify({ type: 'join', roomId: 'replace-room' }));
    await waitFor(firstMessages, (message) => message.type === 'joined');
    second.send(JSON.stringify({ type: 'join', roomId: 'replace-room' }));
    await waitFor(secondMessages, (message) => message.type === 'joined');
    second.close();
    await waitFor(firstMessages, (message) => message.type === 'peer-left');

    const replacement = await connect(runtime.wsUrl);
    const replacementMessages = collect(replacement);
    replacement.send(JSON.stringify({ type: 'join', roomId: 'replace-room' }));
    assert.equal((await waitFor(replacementMessages, (message) => message.type === 'joined')).participants, 2);
  });

  test('enforces configured browser origins', async () => {
    const runtime = await startService({ allowedOrigins: ['https://allowed.example'] });
    await assert.rejects(connect(runtime.wsUrl, 'https://blocked.example'));
    const allowed = await connect(runtime.wsUrl, 'https://allowed.example');
    assert.equal(allowed.readyState, WebSocket.OPEN);
  });

  test('rejects wildcard signaling origins in production', () => {
    assert.throws(
      () => validateAllowedOrigins(['*'], 'production'),
      /canonical HTTPS origins/
    );
    assert.doesNotThrow(() => validateAllowedOrigins(['https://call.example.com'], 'production'));
    assert.throws(
      () => validateAllowedOrigins(['http://call.example.com'], 'production'),
      /canonical HTTPS origins/
    );
    assert.throws(
      () => validateAllowedOrigins(['https://call.example.com/path'], 'production'),
      /canonical HTTPS origins/
    );
  });

  test('closes clients that exceed the signaling message rate', async () => {
    const runtime = await startService({ rateLimitMessages: 2, rateLimitWindowMs: 60_000 });
    const peer = await connect(runtime.wsUrl);
    const closed = new Promise((resolve) => peer.once('close', (code) => resolve(code)));
    peer.send('{');
    peer.send('{');
    peer.send('{');
    assert.equal(await closed, 1008);
  });

  test('closes a slow receiver before its outbound queue can grow unbounded', async () => {
    const runtime = await startService({ maxBufferedBytes: 1024 });
    const first = await connect(runtime.wsUrl);
    const second = await connect(runtime.wsUrl);
    const firstMessages = collect(first);
    const secondMessages = collect(second);
    first.send(JSON.stringify({ type: 'join', roomId: 'slow-room' }));
    await waitFor(firstMessages, (message) => message.type === 'joined');
    second.send(JSON.stringify({ type: 'join', roomId: 'slow-room' }));
    await waitFor(secondMessages, (message) => message.type === 'joined');

    const serverSecond = [...runtime.service.clients][1];
    Object.defineProperty(serverSecond, 'bufferedAmount', { configurable: true, value: 1024 });
    const closed = new Promise((resolve) => second.once('close', (code) => resolve(code)));
    first.send(JSON.stringify({
      type: 'offer',
      description: { type: 'offer', sdp: 'v=0\r\noutbound-backpressure' }
    }));
    assert.equal(await closed, 1009);
  });

  test('rejects malformed WebSocket request targets and remains healthy', async () => {
    const runtime = await startService();
    await sendMalformedUpgrade(runtime.port);
    const response = await fetch(`${runtime.httpUrl}/health`);
    assert.equal(response.status, 200);
  });
});

async function startService(overrides = {}) {
  const service = createSignalingService({
    iceServers: [{ urls: ['stun:example.test:3478'] }],
    logger: { info() {}, warn() {}, error() {} },
    heartbeatMs: 60_000,
    ...overrides
  });
  services.push(service);
  await new Promise((resolve) => service.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = service.httpServer.address();
  return { service, port, httpUrl: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/signal` };
}

function connect(url, origin) {
  return new Promise((resolve, reject) => {
    const webSocket = new WebSocket(url, origin ? { origin } : undefined);
    webSocket.once('open', () => resolve(webSocket));
    webSocket.once('error', reject);
  });
}

function collect(webSocket) {
  const messages = [];
  webSocket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  return messages;
}

async function waitFor(messages, predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = messages.find(predicate);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for message. Received: ${JSON.stringify(messages)}`);
}

function sendMalformedUpgrade(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write('GET /% HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    });
    socket.on('data', () => socket.end());
    socket.on('close', resolve);
    socket.on('error', resolve);
  });
}
