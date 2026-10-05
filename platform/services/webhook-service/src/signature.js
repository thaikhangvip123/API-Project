import { createHmac, timingSafeEqual } from 'node:crypto';

export function createSignature(secret, rawBody) {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifySignature(secret, rawBody, receivedSignature) {
  if (!Buffer.isBuffer(rawBody) || typeof receivedSignature !== 'string') {
    return false;
  }
  const normalized = receivedSignature.startsWith('sha256=')
    ? receivedSignature
    : `sha256=${receivedSignature}`;
  if (!/^sha256=[a-fA-F0-9]{64}$/.test(normalized)) {
    return false;
  }
  const expected = Buffer.from(createSignature(secret, rawBody), 'utf8');
  const received = Buffer.from(normalized.toLowerCase(), 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
