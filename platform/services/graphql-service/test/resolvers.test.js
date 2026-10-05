import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createResolvers } from '../src/resolvers.js';
import { UpstreamError } from '../src/clients.js';

describe('GraphQL resolvers', () => {
  it('uses REST to list users and gRPC to find one user', async () => {
    const resolvers = createResolvers({
      restUserClient: { listUsers: async () => [{ id: 1, email: 'list@example.com', name: 'REST User' }] },
      grpcUserClient: { getUser: async (id) => ({ id, email: 'one@example.com', name: 'gRPC User' }) }
    });

    assert.equal((await resolvers.Query.users())[0].email, 'list@example.com');
    assert.equal((await resolvers.Query.user(null, { id: 5 })).email, 'one@example.com');
  });

  it('returns null for a missing gRPC user and exposes unavailable dependencies', async () => {
    const resolvers = createResolvers({
      restUserClient: { listUsers: async () => { throw new UpstreamError(503, 'user-service is unavailable'); } },
      grpcUserClient: { getUser: async () => { throw new UpstreamError(404, 'User not found'); } }
    });

    assert.equal(await resolvers.Query.user(null, { id: 9 }), null);
    await assert.rejects(() => resolvers.Query.users(), (error) => {
      assert.equal(error.message, 'user-service is unavailable');
      assert.equal(error.extensions.code, 'SERVICE_UNAVAILABLE');
      return true;
    });
  });

  it('reports an invalid user id as bad input', async () => {
    const resolvers = createResolvers({
      restUserClient: { listUsers: async () => [] },
      grpcUserClient: { getUser: async () => { throw new UpstreamError(400, 'User id must be a positive integer'); } }
    });

    await assert.rejects(() => resolvers.Query.user(null, { id: -1 }), (error) => {
      assert.equal(error.extensions.code, 'BAD_USER_INPUT');
      return true;
    });
  });

  it('does not expose unexpected upstream error details', async () => {
    const resolvers = createResolvers({
      restUserClient: { listUsers: async () => { throw new UpstreamError(500, 'database host and stack details'); } },
      grpcUserClient: { getUser: async () => null }
    });

    await assert.rejects(() => resolvers.Query.users(), (error) => {
      assert.equal(error.message, 'Internal server error');
      assert.equal(error.extensions.code, 'INTERNAL_SERVER_ERROR');
      return true;
    });
  });
});
