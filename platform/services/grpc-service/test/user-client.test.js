import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUserClient } from '../src/user-client.js';

describe('user client', () => {
  it('requests individual and all users from the internal service', async () => {
    const requestedUrls = [];
    const client = createUserClient({
      baseUrl: 'http://user-service:3000/',
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        return new Response(JSON.stringify(url.endsWith('/users') ? [] : { id: 1, email: 'user@example.com', name: 'User' }), { status: 200 });
      }
    });

    assert.equal((await client.getUser(1)).email, 'user@example.com');
    assert.deepEqual(await client.listUsers(), []);
    assert.deepEqual(requestedUrls, ['http://user-service:3000/users/1', 'http://user-service:3000/users']);
  });

  it('maps upstream and connection errors to useful statuses', async () => {
    const notFoundClient = createUserClient({
      baseUrl: 'http://user-service:3000',
      fetchImpl: async () => new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
    });
    await assert.rejects(() => notFoundClient.getUser(1), { name: 'UpstreamError', statusCode: 404 });

    const offlineClient = createUserClient({
      baseUrl: 'http://user-service:3000',
      fetchImpl: async () => { throw new TypeError('network error'); }
    });
    await assert.rejects(() => offlineClient.listUsers(), { name: 'UpstreamError', statusCode: 503 });
  });
});
