import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(currentDirectory, '..', 'public');
const roomPattern = /^[A-Za-z0-9_-]{4,64}$/;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);

export function createJsonLogger(output = console) {
  function write(level, fields) {
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, ...fields });
    const method = level === 'error' ? 'error' : 'log';
    output[method](entry);
  }

  return {
    info: (fields) => write('info', fields),
    warn: (fields) => write('warn', fields),
    error: (fields) => write('error', fields)
  };
}

export function validateAllowedOrigins(allowedOrigins, nodeEnv) {
  if (nodeEnv !== 'production') {
    return;
  }
  for (const origin of allowedOrigins) {
    if (origin === '*') {
      throw new Error('SIGNALING_ALLOWED_ORIGINS must list canonical HTTPS origins in production');
    }
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('SIGNALING_ALLOWED_ORIGINS must contain valid origins');
    }
    if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
      throw new Error('SIGNALING_ALLOWED_ORIGINS must list canonical HTTPS origins in production');
    }
  }
}

export function createSignalingService(options = {}) {
  const {
    iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }],
    allowedOrigins = ['*'],
    maxConnections = 1000,
    maxPayloadBytes = 65_536,
    maxBufferedBytes = 262_144,
    rateLimitMessages = 120,
    rateLimitWindowMs = 10_000,
    heartbeatMs = 30_000,
    logger = createJsonLogger()
  } = options;

  const rooms = new Map();
  const clients = new Set();
  const clientState = new WeakMap();
  const httpServer = createServer(async (request, response) => {
    let url;
    try {
      url = new URL(request.url, 'http://service.local');
    } catch {
      sendText(response, 400, 'bad request\n');
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        service: 'webrtc-signaling',
        connections: clients.size,
        rooms: rooms.size
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/config') {
      sendJson(response, 200, { iceServers });
      return;
    }

    const asset = assets.get(url.pathname);
    if (request.method === 'GET' && asset) {
      try {
        const body = await readFile(join(publicDirectory, asset[0]));
        send(response, 200, body, asset[1]);
      } catch (error) {
        logger.error({ event: 'asset_read_failed', path: url.pathname, error: error.message });
        sendText(response, 500, 'internal server error\n');
      }
      return;
    }

    sendText(response, 404, 'not found\n');
  });

  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: maxPayloadBytes });

  httpServer.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'http://service.local');
    } catch {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }

    if (url.pathname !== '/signal') {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (!originAllowed(request.headers.origin, allowedOrigins)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    if (clients.size >= maxConnections) {
      rejectUpgrade(socket, 503, 'Service Unavailable');
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request);
    });
  });

  webSocketServer.on('connection', (webSocket) => {
    const state = {
      id: randomUUID(),
      roomId: null,
      alive: true,
      messageCount: 0,
      rateWindowStartedAt: Date.now()
    };
    clients.add(webSocket);
    clientState.set(webSocket, state);
    sendMessage(webSocket, { type: 'connected', peerId: state.id });
    logger.info({ event: 'signal_connected', peerId: state.id, connections: clients.size });

    webSocket.on('pong', () => {
      state.alive = true;
    });
    webSocket.on('message', (raw) => handleMessage(webSocket, raw));
    webSocket.on('error', (error) => {
      logger.warn({ event: 'signal_socket_error', peerId: state.id, error: error.message });
    });
    webSocket.on('close', () => removeClient(webSocket));
  });

  const heartbeat = setInterval(() => {
    for (const webSocket of clients) {
      const state = clientState.get(webSocket);
      if (!state.alive) {
        webSocket.terminate();
        continue;
      }
      state.alive = false;
      webSocket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  function handleMessage(webSocket, raw) {
    const state = clientState.get(webSocket);
    const now = Date.now();
    if (now - state.rateWindowStartedAt >= rateLimitWindowMs) {
      state.rateWindowStartedAt = now;
      state.messageCount = 0;
    }
    state.messageCount += 1;
    if (state.messageCount > rateLimitMessages) {
      logger.warn({ event: 'signal_rate_limited', peerId: state.id });
      safeSend(webSocket, { type: 'error', code: 'rate_limited', message: 'Signaling rate limit exceeded.' });
      webSocket.close(1008, 'rate limit exceeded');
      return;
    }

    let message;
    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      sendError(webSocket, 'invalid_json', 'Message must be valid JSON.');
      return;
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      sendError(webSocket, 'invalid_message', 'Message must be a JSON object.');
      return;
    }

    if (message.type === 'join') {
      joinRoom(webSocket, message.roomId);
      return;
    }

    if (!state.roomId) {
      sendError(webSocket, 'not_joined', 'Join a room before sending signaling data.');
      return;
    }

    if (message.type === 'offer' || message.type === 'answer') {
      if (!validDescription(message.description, message.type)) {
        sendError(webSocket, 'invalid_description', `Invalid ${message.type} description.`);
        return;
      }
      relayToPeer(webSocket, {
        type: message.type,
        from: state.id,
        description: message.description
      });
      return;
    }

    if (message.type === 'ice-candidate') {
      if (!validCandidate(message.candidate)) {
        sendError(webSocket, 'invalid_candidate', 'Invalid ICE candidate.');
        return;
      }
      relayToPeer(webSocket, {
        type: 'ice-candidate',
        from: state.id,
        candidate: message.candidate
      });
      return;
    }

    sendError(webSocket, 'unsupported_type', 'Unsupported signaling message type.');
  }

  function joinRoom(webSocket, roomId) {
    const state = clientState.get(webSocket);
    if (state.roomId) {
      sendError(webSocket, 'already_joined', 'This connection already joined a room.');
      return;
    }
    if (typeof roomId !== 'string' || !roomPattern.test(roomId)) {
      sendError(webSocket, 'invalid_room', 'Room ID must be 4-64 letters, numbers, underscores, or hyphens.');
      return;
    }

    const room = rooms.get(roomId) || new Set();
    if (room.size >= 2) {
      sendError(webSocket, 'room_full', 'This room already has two participants.');
      return;
    }

    const existingPeer = room.values().next().value;
    room.add(webSocket);
    rooms.set(roomId, room);
    state.roomId = roomId;
    sendMessage(webSocket, { type: 'joined', roomId, peerId: state.id, participants: room.size });
    logger.info({ event: 'room_joined', roomId, peerId: state.id, participants: room.size });

    if (existingPeer) {
      const existingState = clientState.get(existingPeer);
      sendMessage(existingPeer, { type: 'peer-ready', peerId: state.id, initiator: true });
      sendMessage(webSocket, { type: 'peer-ready', peerId: existingState.id, initiator: false });
    }
  }

  function relayToPeer(sender, message) {
    const state = clientState.get(sender);
    const room = rooms.get(state.roomId);
    const peer = room && [...room].find((candidate) => candidate !== sender);
    if (!peer) {
      sendError(sender, 'peer_unavailable', 'The other participant is not connected yet.');
      return;
    }
    safeSend(peer, message);
  }

  function safeSend(webSocket, message) {
    if (webSocket.readyState !== WebSocket.OPEN) {
      return false;
    }
    const serialized = JSON.stringify(message);
    const queuedBytes = webSocket.bufferedAmount + Buffer.byteLength(serialized);
    if (queuedBytes > maxBufferedBytes) {
      const state = clientState.get(webSocket);
      logger.warn({ event: 'signal_backpressure_limit', peerId: state?.id, queuedBytes });
      webSocket.close(1009, 'outbound queue limit exceeded');
      return false;
    }
    webSocket.send(serialized);
    return true;
  }

  function removeClient(webSocket) {
    if (!clients.delete(webSocket)) {
      return;
    }
    const state = clientState.get(webSocket);
    if (state.roomId) {
      const room = rooms.get(state.roomId);
      room?.delete(webSocket);
      if (room?.size === 0) {
        rooms.delete(state.roomId);
      } else {
        for (const peer of room) {
          safeSend(peer, { type: 'peer-left', peerId: state.id });
        }
      }
    }
    logger.info({ event: 'signal_disconnected', peerId: state.id, roomId: state.roomId, connections: clients.size });
  }

  async function close() {
    clearInterval(heartbeat);
    for (const webSocket of clients) {
      webSocket.terminate();
    }
    await new Promise((resolve) => webSocketServer.close(resolve));
    if (httpServer.listening) {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  function sendMessage(webSocket, message) {
    safeSend(webSocket, message);
  }

  function sendError(webSocket, code, message) {
    safeSend(webSocket, { type: 'error', code, message });
  }

  return { httpServer, webSocketServer, close, rooms, clients };
}

function originAllowed(origin, allowedOrigins) {
  return allowedOrigins.includes('*') || (typeof origin === 'string' && allowedOrigins.includes(origin));
}

function validDescription(description, expectedType) {
  return description
    && typeof description === 'object'
    && !Array.isArray(description)
    && description.type === expectedType
    && typeof description.sdp === 'string'
    && description.sdp.length > 0
    && description.sdp.length <= 60_000;
}

function validCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false;
  }
  if (typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096) {
    return false;
  }
  if (candidate.sdpMid != null && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 256)) {
    return false;
  }
  if (candidate.sdpMLineIndex != null
      && (!Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0)) {
    return false;
  }
  return true;
}

function rejectUpgrade(socket, status, reason) {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function sendJson(response, status, value) {
  send(response, status, Buffer.from(JSON.stringify(value)), 'application/json; charset=utf-8');
}

function sendText(response, status, value) {
  send(response, status, Buffer.from(value), 'text/plain; charset=utf-8');
}

function send(response, status, body, contentType) {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}
