import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGrpcUserClient, createRestUserClient, mapGrpcError } from '../src/clients.js';

describe('REST user client', () => {
  it('lists users from user-service', async () => {
    let requestedUrl;
    const client = createRestUserClient({
      baseUrl: 'http://user-service:3000/',
      fetchImpl: async (url) => {
        requestedUrl = url;
        return new Response(JSON.stringify([{ id: 1, email: 'user@example.com', name: 'User' }]), { status: 200 });
      }
    });

    assert.equal((await client.listUsers())[0].id, 1);
    assert.equal(requestedUrl, 'http://user-service:3000/users');
  });

  it('maps REST failures to upstream errors', async () => {
    const client = createRestUserClient({
      baseUrl: 'http://user-service:3000',
      fetchImpl: async () => new Response(JSON.stringify({ error: 'Failure' }), { status: 503 })
    });

    await assert.rejects(() => client.listUsers(), { name: 'UpstreamError', statusCode: 503 });
  });

  it('validates timeout configuration and maps gRPC deadlines as unavailable', () => {
    assert.throws(() => createRestUserClient({ baseUrl: 'http://user-service:3000', timeoutMs: 0 }), /positive integer/);
    assert.throws(() => createGrpcUserClient({ host: '', timeoutMs: 5000 }), /GRPC_SERVICE_HOST/);
    const deadlineError = mapGrpcError({ code: 4, details: 'connect ECONNREFUSED 172.20.0.4:50051' });
    assert.equal(deadlineError.statusCode, 503);
    assert.equal(deadlineError.message, 'grpc-service is unavailable');
  });
});
