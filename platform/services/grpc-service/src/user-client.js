export class UpstreamError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'UpstreamError';
    this.statusCode = statusCode;
  }
}

export function createUserClient({ baseUrl = process.env.USER_SERVICE_URL, fetchImpl = fetch, timeoutMs = Number(process.env.USER_SERVICE_TIMEOUT_MS || 5000) } = {}) {
  if (!baseUrl) {
    throw new Error('USER_SERVICE_URL must be configured');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('USER_SERVICE_TIMEOUT_MS must be a positive integer');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  return {
    async getUser(id) {
      return requestJson(`/users/${validateId(id)}`);
    },

    async listUsers() {
      return requestJson('/users');
    }
  };

  async function requestJson(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, { signal: controller.signal });
      const body = await parseJson(response);
      if (!response.ok) {
        throw new UpstreamError(response.status, body?.error || 'user-service request failed');
      }

      return body;
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw error;
      }
      throw new UpstreamError(503, 'user-service is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function validateId(id) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new UpstreamError(400, 'User id must be a positive integer');
  }

  return id;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
