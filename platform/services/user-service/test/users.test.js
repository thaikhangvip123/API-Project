import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUserService } from '../src/users.js';

describe('user service', () => {
  it('creates, lists, updates, and deletes users', async () => {
    const repository = createMemoryRepository();
    const service = createUserService({ repository });

    const created = await service.create({ email: 'User@example.com', name: 'Original User' });
    assert.equal(created.email, 'user@example.com');

    assert.deepEqual(await service.list(), [created]);
    assert.equal((await service.get(created.id)).name, 'Original User');

    const updated = await service.update(created.id, { name: 'Updated User' });
    assert.equal(updated.name, 'Updated User');

    await service.remove(created.id);
    await assert.rejects(() => service.get(created.id), /User not found/);
  });

  it('validates input and prevents duplicate email addresses', async () => {
    const service = createUserService({ repository: createMemoryRepository() });
    await assert.rejects(() => service.create({ email: 'bad-email', name: 'User' }), /Valid email/);
    await service.create({ email: 'user@example.com', name: 'User' });
    await assert.rejects(() => service.create({ email: 'user@example.com', name: 'Other' }), /Email is already registered/);
    await assert.rejects(() => service.update(0, { name: 'User' }), /positive integer/);
  });
});

function createMemoryRepository() {
  const users = new Map();
  let nextId = 1;
  return {
    async health() {},
    async list() { return [...users.values()]; },
    async findById(id) { return users.get(id) || null; },
    async create(data) {
      if ([...users.values()].some((user) => user.email === data.email)) {
        const error = new Error('Unique constraint');
        error.code = 'P2002';
        throw error;
      }
      const user = { id: nextId++, ...data };
      users.set(user.id, user);
      return user;
    },
    async update(id, data) {
      const current = users.get(id);
      if (!current) return null;
      if (data.email && [...users.values()].some((user) => user.id !== id && user.email === data.email)) {
        const error = new Error('Unique constraint');
        error.code = 'P2002';
        throw error;
      }
      const updated = { ...current, ...data };
      users.set(id, updated);
      return updated;
    },
    async remove(id) { return users.delete(id); }
  };
}
