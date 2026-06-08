import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import bcrypt from 'bcrypt';
import { prisma } from './setup.js';

afterAll(async () => {
  // Only clean up this suite's own data
  await prisma.refreshToken.deleteMany({
    where: { user: { email: { endsWith: '@dbtest.local' } } },
  });
  await prisma.errorLog.deleteMany({
    where: { message: { startsWith: '[TEST]' } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: '@dbtest.local' } },
  });
  await prisma.$disconnect();
});

// ─── 1. Prisma Connection ────────────────────────────────────────────
describe('Prisma connection', () => {
  it('connects to the database', async () => {
    const result = await prisma.$queryRaw`SELECT 1 AS connected`;
    expect(result[0].connected).toBe(1);
  });
});

// ─── 2. Seed Data Verification ──────────────────────────────────────
describe('Seed data', () => {
  it('admin user exists with correct role', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@forge.local' },
    });
    expect(admin).not.toBeNull();
    expect(admin.firstName).toBe('Admin');
    expect(admin.role).toBe('ADMIN');
    expect(admin.isActive).toBe(true);
  });

  it('regular user exists with correct role', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'user@forge.local' },
    });
    expect(user).not.toBeNull();
    expect(user.firstName).toBe('Regular');
    expect(user.role).toBe('USER');
  });

  it('seed passwords are properly hashed', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@forge.local' },
    });
    const isValid = await bcrypt.compare('changeme123', admin.password);
    expect(isValid).toBe(true);
  });
});

// ─── 3. User Model CRUD ─────────────────────────────────────────────
describe('User model', () => {
  const testEmail = 'crud@dbtest.local';

  it('creates a user', async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: await bcrypt.hash('testpass', 10),
        firstName: 'Test',
        lastName: 'User',
      },
    });
    expect(user.id).toBeDefined();
    expect(user.role).toBe('USER');
    expect(user.isActive).toBe(true);
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('reads a user by email', async () => {
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user.firstName).toBe('Test');
  });

  it('updates a user', async () => {
    const user = await prisma.user.update({
      where: { email: testEmail },
      data: { firstName: 'Updated' },
    });
    expect(user.firstName).toBe('Updated');
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('enforces unique email constraint', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: testEmail,
          password: 'dupe',
          firstName: 'Dupe',
          lastName: 'User',
        },
      })
    ).rejects.toThrow();
  });

  it('deletes a user', async () => {
    await prisma.user.delete({ where: { email: testEmail } });
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user).toBeNull();
  });
});

// ─── 4. RefreshToken Model ──────────────────────────────────────────
describe('RefreshToken model', () => {
  let testUserId;
  const testEmail = 'token@dbtest.local';

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: await bcrypt.hash('testpass', 10),
        firstName: 'Token',
        lastName: 'Tester',
      },
    });
    testUserId = user.id;
  });

  it('creates a refresh token linked to a user', async () => {
    const token = await prisma.refreshToken.create({
      data: {
        token: 'test-refresh-token-abc123',
        userId: testUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    expect(token.id).toBeDefined();
    expect(token.userId).toBe(testUserId);
  });

  it('finds tokens by user relation', async () => {
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { refreshTokens: true },
    });
    expect(user.refreshTokens).toHaveLength(1);
    expect(user.refreshTokens[0].token).toBe('test-refresh-token-abc123');
  });

  it('cascade deletes tokens when user is deleted', async () => {
    await prisma.user.delete({ where: { email: testEmail } });
    const tokens = await prisma.refreshToken.findMany({
      where: { userId: testUserId },
    });
    expect(tokens).toHaveLength(0);
  });
});

// ─── 5. ErrorLog Model ──────────────────────────────────────────────
describe('ErrorLog model', () => {
  it('creates an error log entry', async () => {
    const log = await prisma.errorLog.create({
      data: {
        message: '[TEST] Something went wrong',
        stack: 'Error: Something went wrong\n    at test.js:1:1',
        method: 'POST',
        url: '/api/test',
        body: '{"foo":"bar"}',
        severity: 'ERROR',
      },
    });
    expect(log.id).toBeDefined();
    expect(log.severity).toBe('ERROR');
    expect(log.createdAt).toBeInstanceOf(Date);
  });

  it('defaults severity to ERROR', async () => {
    const log = await prisma.errorLog.create({
      data: { message: '[TEST] Default severity' },
    });
    expect(log.severity).toBe('ERROR');
  });

  it('supports WARN and INFO severities', async () => {
    const warn = await prisma.errorLog.create({
      data: { message: '[TEST] Warning entry', severity: 'WARN' },
    });
    const info = await prisma.errorLog.create({
      data: { message: '[TEST] Info entry', severity: 'INFO' },
    });
    expect(warn.severity).toBe('WARN');
    expect(info.severity).toBe('INFO');
  });
});
