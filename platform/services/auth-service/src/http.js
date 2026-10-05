import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { HttpError } from './auth.js';

const MAX_BODY_BYTES = 1024 * 1024;

export function createServer({ authService, logger = createJsonLogger() }) {
  return http.createServer(async (request, response) => {
    const requestId = request.headers['x-request-id'] || randomUUID();
    const startedAt = Date.now();

    response.setHeader('X-Request-Id', requestId);

    try {
      const result = await routeRequest(request, authService);
      sendJson(response, result.statusCode, result.body);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const message = statusCode === 500 ? 'Internal server error' : error.message;

      sendJson(response, statusCode, { error: message });

      logger.error({
        event: 'request_failed',
        requestId,
        method: request.method,
        path: request.url,
        statusCode,
        error: error.message
      });
      return;
    }

    logger.info({
      event: 'request_completed',
      requestId,
      method: request.method,
      path: request.url,
      statusCode: response.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
}

async function routeRequest(request, authService) {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    return {
      statusCode: 200,
      body: {
        status: 'ok',
        service: 'auth-service'
      }
    };
  }

  if (request.method === 'POST' && url.pathname === '/register') {
    const body = await readJsonBody(request);
    return {
      statusCode: 201,
      body: authService.register(body)
    };
  }

  if (request.method === 'POST' && url.pathname === '/login') {
    const body = await readJsonBody(request);
    return {
      statusCode: 200,
      body: authService.login(body)
    };
  }

  if (request.method === 'GET' && url.pathname === '/verify') {
    const token = extractBearerToken(request.headers.authorization);
    return {
      statusCode: 200,
      body: authService.verify(token)
    };
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

function extractBearerToken(authorization) {
  if (typeof authorization !== 'string') {
    throw new HttpError(401, 'Authorization header is required');
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, 'Authorization header must use Bearer scheme');
  }

  return match[1];
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(body)}\n`);
}

export function createJsonLogger() {
  function log(level, data) {
    const entry = {
      level,
      timestamp: new Date().toISOString(),
      ...data
    };

    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  return {
    info: (data) => log('info', data),
    error: (data) => log('error', data)
  };
}
