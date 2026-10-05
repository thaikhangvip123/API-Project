import { randomUUID } from 'node:crypto';

export function normalizeUsername(value, socketId) {
  if (typeof value !== 'string' || value.trim() === '') {
    return `guest-${socketId.slice(0, 6)}`;
  }
  return value.trim().slice(0, 40);
}

export function normalizeMessage(value, maxLength) {
  if (typeof value !== 'string') {
    throw new Error('Message must be a string');
  }
  const text = value.trim();
  if (text === '') {
    throw new Error('Message must not be empty');
  }
  if (text.length > maxLength) {
    throw new Error(`Message must not exceed ${maxLength} characters`);
  }
  return text;
}

export function createChatMessage({ username, text, now = () => new Date(), createId = randomUUID }) {
  return {
    id: createId(),
    username,
    text,
    timestamp: now().toISOString()
  };
}
