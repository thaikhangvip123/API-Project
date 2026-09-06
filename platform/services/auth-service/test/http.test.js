import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createAuthService } from '../src/auth.js';
import { createServer } from '../src/http.js';

const silentLogger = {
  info: () => {},
  error: () => {}
};

describe('auth HTTP API', () => {
  let server;
  let baseUrl;

  before(async () => {
    const authService = createAuthService({
      jwtSecret: 'test_secret',
      expiresIn: '1h'
    });

    server = createServer({ authService, logger: silentLogger });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('serves health, register, login, and verify endpoints', async () => {
    const health = await fetchJson('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');

    const registration = await fetchJson('/register', {
      method: 'POST',
      body: {
        email: 'api@example.com',
        password: 'password123',
        name: 'API User'
      }
    });
    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.email, 'api@example.com');

    const login = await fetchJson('/login', {
      method: 'POST',
      body: {
        email: 'api@example.com',
        password: 'password123'
      }
    });
    assert.equal(login.status, 200);
    assert.equal(typeof login.body.token, 'string');

    const verify = await fetchJson('/verify', {
      headers: {
        Authorization: `Bearer ${login.body.token}`
      }
    });
    assert.equal(verify.status, 200);
    assert.equal(verify.body.valid, true);
  });

  it('returns useful client errors', async () => {
    const missingAuth = await fetchJson('/verify');
    assert.equal(missingAuth.status, 401);

    const notFound = await fetchJson('/missing');
    assert.equal(notFound.status, 404);
  });

  async function fetchJson(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    return {
      status: response.status,
      body: await response.json()
    };
  }
});
