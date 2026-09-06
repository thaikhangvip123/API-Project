import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAuthService, parseExpiresIn, verifyJwt } from '../src/auth.js';

describe('auth service', () => {
  it('registers, logs in, and verifies a JWT', () => {
    const service = createAuthService({
      jwtSecret: 'test_secret',
      expiresIn: '1h'
    });

    const registration = service.register({
      email: 'User@example.com',
      password: 'password123',
      name: 'Demo User'
    });

    assert.equal(registration.user.email, 'user@example.com');
    assert.equal(registration.tokenType, 'Bearer');
    assert.equal(typeof registration.token, 'string');

    const login = service.login({
      email: 'user@example.com',
      password: 'password123'
    });

    assert.equal(login.user.id, registration.user.id);

    const verification = service.verify(login.token);
    assert.equal(verification.valid, true);
    assert.equal(verification.user.email, 'user@example.com');
  });

  it('rejects invalid credentials', () => {
    const service = createAuthService({
      jwtSecret: 'test_secret',
      expiresIn: '1h'
    });

    service.register({
      email: 'user@example.com',
      password: 'password123'
    });

    assert.throws(
      () => service.login({ email: 'user@example.com', password: 'wrong-password' }),
      /Invalid email or password/
    );
  });

  it('rejects tampered tokens', () => {
    const service = createAuthService({
      jwtSecret: 'test_secret',
      expiresIn: '1h'
    });

    const { token } = service.register({
      email: 'user@example.com',
      password: 'password123'
    });

    assert.throws(() => verifyJwt(`${token}tampered`, 'test_secret'), /Invalid token signature/);
  });

  it('parses supported JWT expiry values', () => {
    assert.equal(parseExpiresIn('30s'), 30);
    assert.equal(parseExpiresIn('15m'), 900);
    assert.equal(parseExpiresIn('2h'), 7200);
    assert.equal(parseExpiresIn('1d'), 86400);
  });
});
