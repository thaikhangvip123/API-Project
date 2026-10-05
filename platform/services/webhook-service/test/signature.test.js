import assert from 'node:assert/strict';
import test from 'node:test';
import { createSignature, verifySignature } from '../src/signature.js';

test('creates and verifies SHA-256 HMAC signatures', () => {
  const body = Buffer.from('{"event":"demo.created"}');
  const signature = createSignature('test-secret', body);
  assert.match(signature, /^sha256=[a-f0-9]{64}$/);
  assert.equal(verifySignature('test-secret', body, signature), true);
  assert.equal(verifySignature('test-secret', body, signature.slice(7)), true);
  assert.equal(verifySignature('wrong-secret', body, signature), false);
  assert.equal(verifySignature('test-secret', body, 'invalid'), false);
});
