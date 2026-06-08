import request from 'supertest';

export const adminUser = {
  email: 'admin@forge.local',
  password: 'changeme123',
};

export const testUser = {
  email: 'user@forge.local',
  password: 'changeme123',
};

/**
 * Log in as the given user and return the access token.
 */
export async function getAuthToken(app, email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  return res.body.accessToken;
}

/**
 * Register a new user and return the full supertest response.
 */
export async function registerUser(app, userData) {
  return request(app).post('/api/auth/register').send(userData);
}

/**
 * Extract the refreshToken cookie from a supertest response.
 */
export function getRefreshCookie(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return undefined;
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.find((c) => c.startsWith('refreshToken='));
}
