import { describe, it, expect, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import swaggerSpec from '../src/config/swagger.js';
import { prisma } from './setup.js';

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── 1. Swagger UI serves ───────────────────────────────────────────
describe('GET /api-docs', () => {
  it('returns 200 with HTML', async () => {
    const res = await request(app).get('/api-docs/').redirects(1);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('swagger');
  });
});

// ─── 2. /docs redirects to /api-docs ────────────────────────────────
describe('GET /docs', () => {
  it('redirects to /api-docs', async () => {
    const res = await request(app).get('/docs');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api-docs');
  });
});

// ─── 3. Swagger spec structure ──────────────────────────────────────
describe('Swagger spec', () => {
  it('has correct OpenAPI version', () => {
    expect(swaggerSpec.openapi).toBe('3.0.0');
  });

  it('has API info', () => {
    expect(swaggerSpec.info.title).toBe('Forge Template API');
    expect(swaggerSpec.info.version).toBe('1.0.0');
  });

  it('has BearerAuth security scheme', () => {
    const scheme = swaggerSpec.components.securitySchemes.BearerAuth;
    expect(scheme).toBeDefined();
    expect(scheme.type).toBe('http');
    expect(scheme.scheme).toBe('bearer');
    expect(scheme.bearerFormat).toBe('JWT');
  });

  it('has User schema', () => {
    const userSchema = swaggerSpec.components.schemas.User;
    expect(userSchema).toBeDefined();
    expect(userSchema.properties.email).toBeDefined();
    expect(userSchema.properties.role.enum).toEqual(['ADMIN', 'USER']);
  });
});

// ─── 4. All auth endpoints documented ───────────────────────────────
describe('Swagger paths', () => {
  const paths = [
    ['/auth/register', 'post'],
    ['/auth/login', 'post'],
    ['/auth/refresh', 'post'],
    ['/auth/logout', 'post'],
    ['/auth/me', 'get'],
  ];

  it.each(paths)('%s %s is documented', (path, method) => {
    expect(swaggerSpec.paths[path]).toBeDefined();
    expect(swaggerSpec.paths[path][method]).toBeDefined();
  });

  it('all documented paths have summaries', () => {
    for (const [path, method] of paths) {
      expect(swaggerSpec.paths[path][method].summary).toBeTruthy();
    }
  });

  it('all documented paths have Authentication tag', () => {
    for (const [path, method] of paths) {
      expect(swaggerSpec.paths[path][method].tags).toContain('Authentication');
    }
  });

  it('protected endpoints require BearerAuth', () => {
    const protectedPaths = [
      ['/auth/logout', 'post'],
      ['/auth/me', 'get'],
    ];
    for (const [path, method] of protectedPaths) {
      const security = swaggerSpec.paths[path][method].security;
      expect(security).toBeDefined();
      expect(security.some((s) => 'BearerAuth' in s)).toBe(true);
    }
  });

  it('public endpoints do not require BearerAuth', () => {
    const publicPaths = [
      ['/auth/register', 'post'],
      ['/auth/login', 'post'],
      ['/auth/refresh', 'post'],
    ];
    for (const [path, method] of publicPaths) {
      const security = swaggerSpec.paths[path][method].security;
      expect(security).toBeUndefined();
    }
  });
});
