const DEFAULT_TIMEOUT_MS = 8000;

export class ApiError extends Error {
  constructor(message, { status = 0, body = null, code = 'request_failed' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      body: options.rawBody !== undefined
        ? options.rawBody
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
      credentials: 'same-origin',
      signal: controller.signal
    });
    const body = await parseResponse(response);
    const durationMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      const message = getErrorMessage(body) || `Request failed with HTTP ${response.status}`;
      throw new ApiError(message, { status: response.status, body, code: 'http_error' });
    }

    return { status: response.status, body, durationMs };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out. Vui lòng thử lại.', { code: 'timeout' });
    }
    throw new ApiError('Không thể kết nối tới service.', { code: 'network_error' });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function parseResponse(response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new ApiError('Service trả về JSON không hợp lệ.', {
        status: response.status,
        code: 'invalid_response'
      });
    }
  }
  return raw;
}

function getErrorMessage(body) {
  if (body && typeof body === 'object' && typeof body.error === 'string') {
    return body.error;
  }
  return null;
}
