import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import { prisma } from './setup.js';

let adminToken;
let userToken;
let seededErrorIds = [];

// ─── Helpers ──────────────────────────────────────────────────────────
function getCookies(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function getRefreshCookie(res) {
  return getCookies(res).find((c) => c.startsWith('refreshToken='));
}

// ─── Setup / Teardown ─────────────────────────────────────────────────
beforeAll(async () => {
  // Log in as seeded admin
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@forge.local', password: 'changeme123' });
  adminToken = adminRes.body.accessToken;

  // Log in as seeded regular user
  const userRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'user@forge.local', password: 'changeme123' });
  userToken = userRes.body.accessToken;

  // Seed test error log entries for pagination / filter tests
  const severities = ['ERROR', 'WARN', 'INFO'];
  const entries = [];
  for (let i = 0; i < 30; i++) {
    entries.push({
      message: `[TEST] Seeded error #${i + 1}`,
      severity: severities[i % 3],
      method: 'GET',
      url: `/api/test/endpoint-${i}`,
      stack: i % 2 === 0 ? `Error: test stack trace #${i}\n    at test.js:${i}` : null,
      createdAt: new Date(Date.now() - i * 60 * 60 * 1000), // spread over hours
    });
  }
  const created = await Promise.all(
    entries.map((e) => prisma.errorLog.create({ data: e }))
  );
  seededErrorIds = created.map((e) => e.id);
});

afterAll(async () => {
  // Clean up seeded error entries
  if (seededErrorIds.length) {
    await prisma.errorLog.deleteMany({
      where: { id: { in: seededErrorIds } },
    });
  }
  // Clean up any [TEST]-prefixed error log entries
  await prisma.errorLog.deleteMany({
    where: { message: { startsWith: '[TEST]' } },
  });
  await prisma.$disconnect();
});

// ─── 1. Auth & Authorization Checks ──────────────────────────────────
describe('Admin API - Auth guards', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/admin/errors');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .get('/api/admin/errors')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for admin user', async () => {
    const res = await request(app)
      .get('/api/admin/errors')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ─── 2. GET /api/admin/errors - Listing ──────────────────────────────
describe('GET /api/admin/errors', () => {
  it('returns paginated error list with expected shape', async () => {
    const res = await request(app)
      .get('/api/admin/errors')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('errors');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('totalPages');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.page).toBe(1);
  });

  it('returns results ordered by createdAt desc', async () => {
    const res = await request(app)
      .get('/api/admin/errors?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    const dates = res.body.errors.map((e) => new Date(e.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it('respects limit parameter', async () => {
    const res = await request(app)
      .get('/api/admin/errors?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.errors.length).toBeLessThanOrEqual(5);
  });

  it('paginates correctly', async () => {
    const page1 = await request(app)
      .get('/api/admin/errors?limit=10&page=1')
      .set('Authorization', `Bearer ${adminToken}`);

    const page2 = await request(app)
      .get('/api/admin/errors?limit=10&page=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);

    // Pages should have different entries
    const page1Ids = page1.body.errors.map((e) => e.id);
    const page2Ids = page2.body.errors.map((e) => e.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);

    // totalPages should be consistent
    expect(page1.body.totalPages).toBe(page2.body.totalPages);
  });

  it('calculates totalPages correctly', async () => {
    const res = await request(app)
      .get('/api/admin/errors?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.totalPages).toBe(Math.ceil(res.body.total / 10));
  });
});

// ─── 3. Filters ──────────────────────────────────────────────────────
describe('GET /api/admin/errors - Filters', () => {
  it('filters by severity=ERROR', async () => {
    const res = await request(app)
      .get('/api/admin/errors?severity=ERROR&limit=100')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors.every((e) => e.severity === 'ERROR')).toBe(true);
  });

  it('filters by severity=WARN', async () => {
    const res = await request(app)
      .get('/api/admin/errors?severity=WARN&limit=100')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.errors.every((e) => e.severity === 'WARN')).toBe(true);
  });

  it('filters by severity=INFO', async () => {
    const res = await request(app)
      .get('/api/admin/errors?severity=INFO&limit=100')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.errors.every((e) => e.severity === 'INFO')).toBe(true);
  });

  it('filters by date range', async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const res = await request(app)
      .get(
        `/api/admin/errors?startDate=${twoHoursAgo.toISOString()}&endDate=${now.toISOString()}&limit=100`
      )
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const err of res.body.errors) {
      const ts = new Date(err.createdAt).getTime();
      expect(ts).toBeGreaterThanOrEqual(twoHoursAgo.getTime() - 1000);
      expect(ts).toBeLessThanOrEqual(now.getTime() + 1000);
    }
  });

  it('combines severity and date filters', async () => {
    const now = new Date();
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);

    const res = await request(app)
      .get(
        `/api/admin/errors?severity=ERROR&startDate=${fiveHoursAgo.toISOString()}&endDate=${now.toISOString()}&limit=100`
      )
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.errors.every((e) => e.severity === 'ERROR')).toBe(true);
  });

  it('ignores invalid severity values', async () => {
    const res = await request(app)
      .get('/api/admin/errors?severity=BOGUS')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Should return all (no filter applied)
    expect(res.body.total).toBeGreaterThanOrEqual(30);
  });
});

// ─── 4. GET /api/admin/errors/:id - Single error detail ─────────────
describe('GET /api/admin/errors/:id', () => {
  it('returns full error detail including stack trace', async () => {
    const res = await request(app)
      .get(`/api/admin/errors/${seededErrorIds[0]}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.error.id).toBe(seededErrorIds[0]);
    expect(res.body.error.message).toContain('[TEST]');
    expect(res.body.error).toHaveProperty('stack');
    expect(res.body.error).toHaveProperty('method');
    expect(res.body.error).toHaveProperty('url');
    expect(res.body.error).toHaveProperty('severity');
    expect(res.body.error).toHaveProperty('createdAt');
  });

  it('returns 404 for non-existent error', async () => {
    const res = await request(app)
      .get('/api/admin/errors/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .get(`/api/admin/errors/${seededErrorIds[0]}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── 5. Trigger a real server error and verify it's logged ──────────
describe('Error logging end-to-end', () => {
  let timestampBefore;

  it('logs a server error to the database when a bad request triggers errorHandler', async () => {
    timestampBefore = new Date();

    // Send malformed JSON to trigger a parse error through the error handler
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ invalid json !!!');

    expect(res.status).toBe(400);

    // Poll for the error entry (async DB write may lag)
    let entry = null;
    for (let i = 0; i < 20; i++) {
      entry = await prisma.errorLog.findFirst({
        where: {
          url: '/api/auth/login',
          method: 'POST',
          createdAt: { gte: timestampBefore },
          message: { contains: 'JSON' },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (entry) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    expect(entry).not.toBeNull();
    expect(entry.message).toContain('JSON');
  });

  it('triggered error appears in admin error list', async () => {
    const res = await request(app)
      .get(`/api/admin/errors?startDate=${timestampBefore.toISOString()}&limit=10`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.errors.length).toBeGreaterThan(0);

    const jsonError = res.body.errors.find(
      (e) => e.url === '/api/auth/login' && e.message.includes('JSON')
    );
    expect(jsonError).toBeDefined();
    expect(jsonError.method).toBe('POST');
  });
});

// ─── 6. DELETE /api/admin/errors/cleanup ─────────────────────────────
describe('DELETE /api/admin/errors/cleanup', () => {
  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .delete('/api/admin/errors/cleanup')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('deletes errors older than 30 days and returns count', async () => {
    // Insert an old error (45 days ago)
    const oldEntry = await prisma.errorLog.create({
      data: {
        message: '[TEST] Old error for cleanup test',
        severity: 'ERROR',
        createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .delete('/api/admin/errors/cleanup')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count');
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.message).toContain('Deleted');

    // Verify the old entry is gone
    const found = await prisma.errorLog.findUnique({ where: { id: oldEntry.id } });
    expect(found).toBeNull();
  });

  it('returns count 0 when no old errors exist', async () => {
    const res = await request(app)
      .delete('/api/admin/errors/cleanup')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

// ─── 7. Swagger docs include admin endpoints ─────────────────────────
describe('Swagger - Admin endpoints', () => {
  let swaggerSpec;

  beforeAll(async () => {
    const mod = await import('../src/config/swagger.js');
    swaggerSpec = mod.default;
  });

  const adminPaths = [
    ['/admin/errors', 'get'],
    ['/admin/errors/{id}', 'get'],
    ['/admin/errors/cleanup', 'delete'],
  ];

  it.each(adminPaths)('%s %s is documented', (path, method) => {
    expect(swaggerSpec.paths[path]).toBeDefined();
    expect(swaggerSpec.paths[path][method]).toBeDefined();
  });

  it('all admin endpoints have Admin tag', () => {
    for (const [path, method] of adminPaths) {
      expect(swaggerSpec.paths[path][method].tags).toContain('Admin');
    }
  });

  it('all admin endpoints require BearerAuth', () => {
    for (const [path, method] of adminPaths) {
      const security = swaggerSpec.paths[path][method].security;
      expect(security).toBeDefined();
      expect(security.some((s) => 'BearerAuth' in s)).toBe(true);
    }
  });

  it('has ErrorLog schema', () => {
    const schema = swaggerSpec.components.schemas.ErrorLog;
    expect(schema).toBeDefined();
    expect(schema.properties.message).toBeDefined();
    expect(schema.properties.severity.enum).toEqual(['ERROR', 'WARN', 'INFO']);
  });
});
