import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHandlers, toGrpcError, toGrpcUser } from '../src/handlers.js';
import { UpstreamError } from '../src/user-client.js';

describe('gRPC handlers', () => {
  it('returns transformed user data from the user client', async () => {
    const handlers = createHandlers({ userClient: { getUser: async () => ({ id: 1, email: 'user@example.com', name: 'User', createdAt: 'created', updatedAt: 'updated' }), listUsers: async () => [] } });
    const result = await invoke(handlers.getUser, { id: 1 });
    assert.equal(result.id, 1);
    assert.equal(result.createdAt, 'created');
  });

  it('maps REST failures to gRPC status codes', async () => {
    const handlers = createHandlers({ userClient: { getUser: async () => { throw new UpstreamError(404, 'User not found'); }, listUsers: async () => [] } });
    await assert.rejects(() => invoke(handlers.getUser, { id: 1 }), { code: 5, message: 'User not found' });
    assert.equal(toGrpcError(new UpstreamError(503, 'Unavailable')).code, 14);
    assert.equal(toGrpcUser({ id: 1, email: 'a@example.com', name: 'A' }).updatedAt, '');
  });

  it('returns a real error object for gRPC failures', () => {
    const error = toGrpcError(new UpstreamError(400, 'Invalid id'));
    assert.equal(error instanceof Error, true);
    assert.equal(error.code, 3);
  });
});

function invoke(handler, request) {
  return new Promise((resolve, reject) => handler({ request }, (error, response) => error ? reject(error) : resolve(response)));
}
