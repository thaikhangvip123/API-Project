import assert from 'node:assert/strict';
import test from 'node:test';
import { IdempotencyStore } from '../src/idempotency.js';

test('rejects duplicates until an event expires', () => {
  let now = 1000;
  const store = new IdempotencyStore({ ttlMs: 100, maxEntries: 2, now: () => now });
  assert.equal(store.claim('evt-1'), 'claimed');
  store.complete('evt-1');
  assert.equal(store.claim('evt-1'), 'completed');
  now = 1100;
  assert.equal(store.claim('evt-1'), 'claimed');
});

test('releases failed events and keeps the store bounded', () => {
  const store = new IdempotencyStore({ ttlMs: 100, maxEntries: 2 });
  assert.equal(store.claim('evt-1'), 'claimed');
  store.release('evt-1');
  assert.equal(store.claim('evt-1'), 'claimed');
  store.complete('evt-1');
  assert.equal(store.claim('evt-2'), 'claimed');
  store.complete('evt-2');
  assert.equal(store.claim('evt-3'), 'claimed');
  assert.equal(store.entries.size, 2);
});

test('does not evict in-progress events when capacity is reached', () => {
  const store = new IdempotencyStore({ ttlMs: 1000, maxEntries: 2 });
  assert.equal(store.claim('evt-1'), 'claimed');
  assert.equal(store.claim('evt-2'), 'claimed');
  assert.equal(store.claim('evt-3'), 'full');
  assert.equal(store.claim('evt-1'), 'processing');
});

test('does not expire an event while it is still processing', () => {
  let now = 1000;
  const store = new IdempotencyStore({ ttlMs: 100, maxEntries: 2, now: () => now });
  assert.equal(store.claim('evt-long'), 'claimed');
  now = 5000;
  assert.equal(store.claim('evt-long'), 'processing');
  store.complete('evt-long');
  now = 5100;
  assert.equal(store.claim('evt-long'), 'claimed');
});
