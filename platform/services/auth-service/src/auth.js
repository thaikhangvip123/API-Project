import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function createAuthService(options = {}) {
  const usersByEmail = new Map();
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || '1h';

  if (!jwtSecret || jwtSecret === 'change_me') {
    throw new Error('JWT_SECRET must be configured');
  }

  function register({ email, password, name }) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
      throw new HttpError(400, 'Valid email is required');
    }

    if (typeof password !== 'string' || password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }

    if (usersByEmail.has(normalizedEmail)) {
      throw new HttpError(409, 'Email is already registered');
    }

    const user = {
      id: randomBytes(12).toString('hex'),
      email: normalizedEmail,
      name: typeof name === 'string' && name.trim() ? name.trim() : normalizedEmail,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };

    usersByEmail.set(normalizedEmail, user);

    return issueAuthResponse(user);
  }

  function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const user = usersByEmail.get(normalizedEmail);

    if (!user || typeof password !== 'string' || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'Invalid email or password');
    }

    return issueAuthResponse(user);
  }

  function verify(token) {
    const payload = verifyJwt(token, jwtSecret);
    const user = usersByEmail.get(payload.email);

    if (!user || user.id !== payload.sub) {
      throw new HttpError(401, 'Token user no longer exists');
    }

    return {
      valid: true,
      user: sanitizeUser(user),
      payload
    };
  }

  function issueAuthResponse(user) {
    const token = signJwt(
      {
        sub: user.id,
        email: user.email,
        name: user.name
      },
      jwtSecret,
      expiresIn
    );

    return {
      token,
      tokenType: 'Bearer',
      expiresIn,
      user: sanitizeUser(user)
    };
  }

  return {
    register,
    login,
    verify,
    countUsers: () => usersByEmail.size
  };
}

export function signJwt(payload, secret, expiresIn) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = parseExpiresIn(expiresIn);
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = {
    ...payload,
    iat: now,
    exp: now + ttl
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const signature = hmac(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwt(token, secret) {
  if (typeof token !== 'string') {
    throw new HttpError(401, 'Bearer token is required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new HttpError(401, 'Invalid token format');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = hmac(`${encodedHeader}.${encodedPayload}`, secret);

  if (!safeEqual(signature, expectedSignature)) {
    throw new HttpError(401, 'Invalid token signature');
  }

  let header;
  let payload;

  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new HttpError(401, 'Invalid token payload');
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new HttpError(401, 'Unsupported token header');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new HttpError(401, 'Token has expired');
  }

  return payload;
}

export function parseExpiresIn(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('JWT_EXPIRES_IN must be a positive duration');
  }

  const match = value.trim().match(/^(\d+)([smhd])?$/);
  if (!match) {
    throw new Error('JWT_EXPIRES_IN must use seconds, m, h, or d');
  }

  const amount = Number(match[1]);
  const unit = match[2] || 's';
  const multipliers = {
    s: 1,
    m: 60,
    h: DEFAULT_EXPIRES_IN_SECONDS,
    d: 24 * DEFAULT_EXPIRES_IN_SECONDS
  };

  return amount * multipliers[unit];
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, iterationsValue, salt, hash] = storedHash.split('$');

  if (algorithm !== 'pbkdf2_sha256') {
    return false;
  }

  const iterations = Number(iterationsValue);
  const derived = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const expected = Buffer.from(hash, 'hex');

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt
  };
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function hmac(input, secret) {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
