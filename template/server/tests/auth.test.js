import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import { prisma } from './setup.js';

const TEST_USER = {
  email: 'auth@authtest.local',
  password: 'testpass123',
  firstName: 'Auth',
  lastName: 'Tester',
};

let accessToken;
let refreshCookie;

function getCookies(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function getRefreshCookie(res) {
  return getCookies(res).find((c) => c.startsWith('refreshToken='));
}

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
});

afterAll(async () => {
  // Only clean up this suite's own data
  await prisma.refreshToken.deleteMany({
    where: { user: { email: { endsWith: '@authtest.local' } } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: '@authtest.local' } },
  });
  await prisma.$disconnect();
});

// ─── 1. Registration ────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('registers a new user and returns 201 with tokens', async () => {
    const res = await request(app).post('/api/auth/register').send(TEST_USER);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.firstName).toBe(TEST_USER.firstName);
    expect(res.body.user.role).toBe('USER');
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.accessToken).toBeDefined();

    const rtCookie = getRefreshCookie(res);
    expect(rtCookie).toBeDefined();
    expect(rtCookie).toContain('HttpOnly');
    expect(rtCookie).toContain('Path=/api/auth/refresh');
  });

  it('returns 409 for duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send(TEST_USER);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already registered');
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.some((d) => d.field === 'email')).toBe(true);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, email: 'new@authtest.local', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => d.field === 'password')).toBe(true);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@authtest.local' });

    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 2. Login ───────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.accessToken).toBeDefined();

    accessToken = res.body.accessToken;
    refreshCookie = getRefreshCookie(res);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@authtest.local', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('updates lastLoginAt on successful login', async () => {
    const user = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    expect(user.lastLoginAt).not.toBeNull();
  });
});

// ─── 3. Get Profile ─────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('returns user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.password).toBeUndefined();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed Authorization header', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'NotBearer token');
    expect(res.status).toBe(401);
  });
});

// ─── 4. Token Refresh ───────────────────────────────────────────────
describe('POST /api/auth/refresh', () => {
  it('returns new access token with valid refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    const newRtCookie = getRefreshCookie(res);
    expect(newRtCookie).toBeDefined();

    refreshCookie = newRtCookie;
    accessToken = res.body.accessToken;
  });

  it('returns 401 without refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=invalid-token-value');

    expect(res.status).toBe(401);
  });

  it('old refresh token is revoked after rotation', async () => {
    // Login to get a fresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const cookie = getRefreshCookie(loginRes);

    // Use it once (rotates)
    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    // Update tokens for logout test
    refreshCookie = getRefreshCookie(refreshRes);
    accessToken = refreshRes.body.accessToken;

    // Try using the old one again — should fail
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});

// ─── 5. Logout ──────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  it('logs out and clears refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully');

    const cleared = getRefreshCookie(res);
    if (cleared) {
      expect(cleared).toMatch(/expires=Thu, 01 Jan 1970|Max-Age=0/i);
    }
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

// ─── 6. Health Check (sanity) ───────────────────────────────────────
describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});
