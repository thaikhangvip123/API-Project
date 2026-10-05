import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatMessage, normalizeMessage, normalizeUsername } from '../src/chat.js';

test('normalizes usernames and creates a deterministic fallback', () => {
  assert.equal(normalizeUsername('  alice  ', 'abcdef123'), 'alice');
  assert.equal(normalizeUsername('', 'abcdef123'), 'guest-abcdef');
  assert.equal(normalizeUsername('x'.repeat(50), 'abcdef123').length, 40);
});

test('rejects invalid messages', () => {
  assert.throws(() => normalizeMessage('', 10), /must not be empty/);
  assert.throws(() => normalizeMessage('too long', 3), /must not exceed/);
  assert.throws(() => normalizeMessage({ text: 'hello' }, 10), /must be a string/);
});

test('creates a serializable chat message', () => {
  const message = createChatMessage({
    username: 'alice',
    text: 'hello',
    now: () => new Date('2026-09-29T00:00:00.000Z'),
    createId: () => 'message-1'
  });
  assert.deepEqual(message, {
    id: 'message-1',
    username: 'alice',
    text: 'hello',
    timestamp: '2026-09-29T00:00:00.000Z'
  });
});
