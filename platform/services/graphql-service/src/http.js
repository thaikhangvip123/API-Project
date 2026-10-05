import http from 'node:http';

const MAX_BODY_BYTES = 1024 * 1024;

export function createHttpServer({ apolloServer, logger = createJsonLogger() }) {
  return http.createServer((request, response) => handleRequest(request, response, apolloServer, logger));
}

async function handleRequest(request, response, apolloServer, logger) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok', service: 'graphql-service' });
    return;
  }
  if (request.method !== 'POST' || url.pathname !== '/graphql') {
    sendJson(response, 404, { error: 'Route not found' });
    return;
  }
  if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
    sendJson(response, 415, { error: 'Content-Type must be application/json' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const graphqlResponse = await apolloServer.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method: request.method,
        headers: createHeaderMap(request.headers),
        search: url.search,
        body
      },
      context: async () => ({})
    });
    for (const [name, value] of graphqlResponse.headers) {
      response.setHeader(name, value);
    }
    response.statusCode = graphqlResponse.status || 200;
    if (graphqlResponse.body.kind === 'complete') {
      response.end(graphqlResponse.body.string);
      return;
    }
    for await (const chunk of graphqlResponse.body.asyncIterator) {
      response.write(chunk);
    }
    response.end();
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = statusCode >= 500 ? 'Internal server error' : error.message;
    logger.error({ event: 'request_failed', method: request.method, path: url.pathname, statusCode, error: error.message });
    sendJson(response, statusCode, { error: message });
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw createHttpError(413, 'Request body is too large');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw createHttpError(400, 'Request body must be valid JSON');
  }
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createHeaderMap(headers) {
  const map = new Map();
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      map.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : value);
    }
  }
  return map;
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
