export class IdempotencyStore {
  constructor({ ttlMs, maxEntries, now = Date.now }) {
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('Idempotency TTL must be a positive integer');
    }
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('Idempotency maximum entries must be a positive integer');
    }
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
  }

  claim(eventId) {
    this.purgeExpired();
    const existing = this.entries.get(eventId);
    if (existing) {
      return existing.status;
    }
    if (!this.makeRoom()) {
      return 'full';
    }
    this.entries.set(eventId, { status: 'processing', expiresAt: this.now() + this.ttlMs });
    return 'claimed';
  }

  complete(eventId) {
    const entry = this.entries.get(eventId);
    if (entry) {
      entry.status = 'completed';
      entry.expiresAt = this.now() + this.ttlMs;
    }
  }

  release(eventId) {
    this.entries.delete(eventId);
  }

  purgeExpired() {
    const currentTime = this.now();
    for (const [eventId, entry] of this.entries) {
      if (entry.status === 'completed' && entry.expiresAt <= currentTime) {
        this.entries.delete(eventId);
      }
    }
  }

  makeRoom() {
    if (this.entries.size < this.maxEntries) {
      return true;
    }
    const completed = [...this.entries].find(([, entry]) => entry.status === 'completed');
    if (!completed) {
      return false;
    }
    this.entries.delete(completed[0]);
    return true;
  }
}
