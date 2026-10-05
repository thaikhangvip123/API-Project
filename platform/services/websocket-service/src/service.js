import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createChatMessage, normalizeMessage, normalizeUsername } from './chat.js';

const clientPath = fileURLToPath(new URL('../public/index.html', import.meta.url));

export function createWebSocketService({
  allowedOrigins = ['*'],
  historyLimit = 50,
  messageMaxLength = 1000,
  logger = createJsonLogger()
} = {}) {
  validatePositiveInteger(historyLimit, 'CHAT_HISTORY_LIMIT');
  validatePositiveInteger(messageMaxLength, 'CHAT_MESSAGE_MAX_LENGTH');
  validateOrigins(allowedOrigins);

  const messageHistory = [];
  let io;
  const httpServer = http.createServer((request, response) => {
    void handleHttpRequest(request, response).catch((error) => {
      logger.error({ event: 'request_failed', error: error.message });
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'Internal server error' });
      } else {
        response.destroy();
      }
    });
  });

  async function handleHttpRequest(request, response) {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        service: 'websocket-service',
        connectedClients: io?.engine.clientsCount || 0
      });
      return;
    }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      try {
        const clientHtml = await readFile(clientPath);
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(clientHtml);
      } catch (error) {
        logger.error({ event: 'client_read_failed', error: error.message });
        sendJson(response, 500, { error: 'Client page is unavailable' });
      }
      return;
    }
    sendJson(response, 404, { error: 'Route not found' });
  }

  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: allowedOrigins.includes('*') ? '*' : allowedOrigins, methods: ['GET', 'POST'] },
    allowRequest: (request, callback) => callback(null, originAllowed(request.headers.origin, allowedOrigins)),
    serveClient: true
  });

  io.on('connection', (socket) => {
    const username = normalizeUsername(socket.handshake.auth?.username, socket.id);
    socket.data.username = username;
    socket.emit('chat:history', messageHistory);
    emitPresence(io);
    logger.info({ event: 'client_connected', socketId: socket.id, username });

    socket.on('chat:username', (value, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      socket.data.username = normalizeUsername(value, socket.id);
      reply({ ok: true, username: socket.data.username });
      logger.info({ event: 'username_updated', socketId: socket.id, username: socket.data.username });
    });

    socket.on('chat:message', (value, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        const text = normalizeMessage(value, messageMaxLength);
        const message = createChatMessage({ username: socket.data.username, text });
        messageHistory.push(message);
        if (messageHistory.length > historyLimit) {
          messageHistory.splice(0, messageHistory.length - historyLimit);
        }
        io.emit('chat:message', message);
        reply({ ok: true, message });
        logger.info({ event: 'message_broadcast', socketId: socket.id, messageId: message.id });
      } catch (error) {
        reply({ ok: false, error: error.message });
        logger.info({ event: 'message_rejected', socketId: socket.id, reason: error.message });
      }
    });

    socket.on('disconnect', (reason) => {
      emitPresence(io);
      logger.info({ event: 'client_disconnected', socketId: socket.id, username: socket.data.username, reason });
    });
  });

  async function close() {
    await new Promise((resolve) => io.close(resolve));
    if (httpServer.listening) {
      await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    }
  }

  return { httpServer, io, close };
}

function emitPresence(io) {
  io.emit('chat:presence', { connectedClients: io.engine.clientsCount });
}

export function validateAllowedOrigins(allowedOrigins, nodeEnv) {
  validateOrigins(allowedOrigins);
  if (nodeEnv !== 'production') {
    return;
  }
  for (const origin of allowedOrigins) {
    if (origin === '*') {
      throw new Error('SOCKET_IO_CORS_ORIGIN must list canonical HTTPS origins in production');
    }
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('SOCKET_IO_CORS_ORIGIN must contain valid origins');
    }
    if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
      throw new Error('SOCKET_IO_CORS_ORIGIN must list canonical HTTPS origins in production');
    }
  }
}

function validateOrigins(allowedOrigins) {
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0 || allowedOrigins.some((origin) => typeof origin !== 'string' || !origin)) {
    throw new Error('SOCKET_IO_CORS_ORIGIN must contain at least one origin');
  }
}

function originAllowed(origin, allowedOrigins) {
  return allowedOrigins.includes('*') || (typeof origin === 'string' && allowedOrigins.includes(origin));
}

function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(body)}\n`);
}

export function createJsonLogger() {
  function log(level, data) {
    const output = JSON.stringify({ level, timestamp: new Date().toISOString(), ...data });
    (level === 'error' ? console.error : console.log)(output);
  }
  return { info: (data) => log('info', data), error: (data) => log('error', data) };
}
