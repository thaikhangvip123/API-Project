import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export class UpstreamError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'UpstreamError';
    this.statusCode = statusCode;
  }
}

export function createRestUserClient({ baseUrl = process.env.USER_SERVICE_URL, fetchImpl = fetch, timeoutMs = getTimeout() } = {}) {
  if (!baseUrl) {
    throw new Error('USER_SERVICE_URL must be configured');
  }
  validateTimeout(timeoutMs);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  return {
    async listUsers() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${normalizedBaseUrl}/users`, { signal: controller.signal });
        const body = await parseJson(response);
        if (!response.ok) {
          throw new UpstreamError(response.status, body?.error || 'user-service request failed');
        }
        return body;
      } catch (error) {
        if (error instanceof UpstreamError) throw error;
        throw new UpstreamError(503, 'user-service is unavailable');
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export function createGrpcUserClient({ host = process.env.GRPC_SERVICE_HOST || 'grpc-service', port = Number(process.env.GRPC_SERVICE_PORT || 50051), timeoutMs = getTimeout() } = {}) {
  if (typeof host !== 'string' || !host.trim()) {
    throw new Error('GRPC_SERVICE_HOST must be configured');
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('GRPC_SERVICE_PORT must be a valid TCP port');
  }
  validateTimeout(timeoutMs);
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const packageDefinition = protoLoader.loadSync(join(currentDirectory, '../proto/user_lookup.proto'), {
    keepCase: false,
    longs: Number,
    enums: Number,
    defaults: true
  });
  const definition = grpc.loadPackageDefinition(packageDefinition).platform.user.v1;
  const client = new definition.UserLookupService(`${host}:${port}`, grpc.credentials.createInsecure());

  return {
    async getUser(id) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new UpstreamError(400, 'User id must be a positive integer');
      }
      return new Promise((resolve, reject) => {
        client.getUser({ id }, { deadline: new Date(Date.now() + timeoutMs) }, (error, user) => {
          if (!error) {
            resolve(user);
            return;
          }
          reject(mapGrpcError(error));
        });
      });
    },

    close() {
      client.close();
    }
  };
}

export function mapGrpcError(error) {
  const statusByGrpcCode = { 3: 400, 4: 503, 5: 404, 14: 503 };
  const statusCode = statusByGrpcCode[error.code] || 500;
  const message = statusCode === 503
    ? 'grpc-service is unavailable'
    : error.details || 'grpc-service request failed';
  return new UpstreamError(statusCode, message);
}

function getTimeout() {
  const timeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 5000);
  validateTimeout(timeoutMs);
  return timeoutMs;
}

function validateTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('UPSTREAM_TIMEOUT_MS must be a positive integer');
  }
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
