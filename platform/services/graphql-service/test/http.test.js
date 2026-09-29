import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ApolloServer } from '@apollo/server';
import { createHttpServer } from '../src/http.js';
import { createResolvers, typeDefs } from '../src/resolvers.js';

const silentLogger = { info: () => {}, error: () => {} };

describe('GraphQL HTTP API', () => {
  let apolloServer;
  let httpServer;
  let baseUrl;

  before(async () => {
    apolloServer = new ApolloServer({
      typeDefs,
      resolvers: createResolvers({
        restUserClient: { listUsers: async () => [{ id: 1, email: 'api@example.com', name: 'API User', createdAt: '', updatedAt: '' }] },
        grpcUserClient: { getUser: async () => null }
      })
    });
    await apolloServer.start();
    httpServer = createHttpServer({ apolloServer, logger: silentLogger });
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
    await apolloServer.stop();
  });

  it('serves health and GraphQL queries', async () => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'graphql-service');

    const response = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ users { id email name } }' })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.users[0].email, 'api@example.com');
  });

  it('returns client errors for malformed requests', async () => {
    const invalidJson = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid'
    });
    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json()).error, 'Request body must be valid JSON');

    const wrongContentType = await fetch(`${baseUrl}/graphql`, { method: 'POST', body: '{}' });
    assert.equal(wrongContentType.status, 415);
  });
});
