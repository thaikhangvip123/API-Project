import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer } from '../src/http.js';
import { createUserService } from '../src/users.js';

const silentLogger = { info: () => {}, error: () => {} };

describe('user HTTP API', () => {
  let server;
  let baseUrl;

  before(async () => {
    const users = new Map();
    let nextId = 1;
    const repository = {
      async health() {}, async list() { return [...users.values()]; }, async findById(id) { return users.get(id) || null; },
      async create(data) { const user = { id: nextId++, ...data }; users.set(user.id, user); return user; },
      async update(id, data) { const user = users.get(id); if (!user) return null; const updated = { ...user, ...data }; users.set(id, updated); return updated; },
      async remove(id) { return users.delete(id); }
    };
    server = createServer({ userService: createUserService({ repository }), logger: silentLogger });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => new Promise((resolve) => server.close(resolve)));

  it('serves CRUD endpoints', async () => {
    assert.equal((await request('/health')).status, 200);
    const created = await request('/users', { method: 'POST', body: { email: 'api@example.com', name: 'API User' } });
    assert.equal(created.status, 201);
    assert.equal((await request('/users')).body.length, 1);
    assert.equal((await request(`/users/${created.body.id}`, { method: 'PUT', body: { name: 'Renamed User' } })).body.name, 'Renamed User');
    assert.equal((await request(`/users/${created.body.id}`, { method: 'DELETE' })).status, 204);
  });

  it('returns useful client errors', async () => {
    assert.equal((await request('/users/invalid')).status, 400);
    assert.equal((await request('/users/999')).status, 404);
    assert.equal((await request('/users', { method: 'POST', body: { name: 'Missing email' } })).status, 400);
  });

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, { method: options.method || 'GET', headers: options.body ? { 'Content-Type': 'application/json' } : {}, body: options.body ? JSON.stringify(options.body) : undefined });
    const body = response.status === 204 ? undefined : await response.json();
    return { status: response.status, body };
  }
});
