import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { HttpError } from './users.js';

const MAX_BODY_BYTES = 1024 * 1024;

export function createServer({ userService, logger = createJsonLogger() }) {
  return http.createServer(async (request, response) => {
    const requestId = request.headers['x-request-id'] || randomUUID();
    const startedAt = Date.now();
    response.setHeader('X-Request-Id', requestId);

    try {
      const result = await routeRequest(request, userService);
      sendJson(response, result.statusCode, result.body);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const message = statusCode === 500 ? 'Internal server error' : error.message;
      sendJson(response, statusCode, { error: message });
      logger.error({ event: 'request_failed', requestId, method: request.method, path: request.url, statusCode, error: error.message });
      return;
    }

    logger.info({ event: 'request_completed', requestId, method: request.method, path: request.url, statusCode: response.statusCode, durationMs: Date.now() - startedAt });
  });
}

async function routeRequest(request, userService) {
  const url = new URL(request.url, 'http://localhost');
  const idMatch = url.pathname.match(/^\/users\/([^/]+)$/);

  if (request.method === 'GET' && url.pathname === '/health') {
    return { statusCode: 200, body: await userService.health() };
  }
  if (request.method === 'GET' && url.pathname === '/users') {
    return { statusCode: 200, body: await userService.list() };
  }
  if (request.method === 'POST' && url.pathname === '/users') {
    return { statusCode: 201, body: await userService.create(await readJsonBody(request)) };
  }
  if (idMatch && request.method === 'GET') {
    return { statusCode: 200, body: await userService.get(idMatch[1]) };
  }
  if (idMatch && request.method === 'PUT') {
    return { statusCode: 200, body: await userService.update(idMatch[1], await readJsonBody(request)) };
  }
  if (idMatch && request.method === 'DELETE') {
    await userService.remove(idMatch[1]);
    return { statusCode: 204 };
  }

  throw new HttpError(404, 'Route not found');
}

async function readJsonBody(request) {
  const contentType = request.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new HttpError(400, 'Content-Type must be application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Request body is too large');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  if (statusCode === 204) {
    response.end();
    return;
  }
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
