import { describe, it, expect, afterAll } from '@jest/globals';
import { prisma } from './setup.js';
import logger from '../src/utils/logger.js';
import { logErrorToDb } from '../src/utils/errorLogger.js';

afterAll(async () => {
  // Only clean up error log entries — this suite doesn't create users
  await prisma.errorLog.deleteMany({
    where: { message: { startsWith: '[TEST]' } },
  });
  await prisma.$disconnect();
});

// ─── 1. Logger imports without errors ────────────────────────────────
describe('Logger', () => {
  it('imports without errors', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.http).toBe('function');
  });

  it('logs info without throwing', () => {
    expect(() => logger.info('Test info message')).not.toThrow();
  });

  it('logs error to database via Winston transport', async () => {
    const marker = `[TEST] winston-transport-${Date.now()}`;

    // Call the PrismaErrorTransport's log() directly and await its
    // callback — this is deterministic, unlike polling after logger.error()
    // which fires-and-forgets through Winston's async pipeline.
    const transport = logger.transports.find(
      (t) => t.constructor.name === 'PrismaErrorTransport'
    );
    expect(transport).toBeDefined();

    await new Promise((resolve) => {
      transport.log({ level: 'error', message: marker }, resolve);
    });

    const entry = await prisma.errorLog.findFirst({ where: { message: marker } });
    expect(entry).not.toBeNull();
    expect(entry.severity).toBe('ERROR');

    // Clean up
    await prisma.errorLog.delete({ where: { id: entry.id } });
  });
});

// ─── 2. errorLogger writes to DB ────────────────────────────────────
describe('logErrorToDb', () => {
  it('writes an error with request context', async () => {
    const error = new Error('[TEST] Something broke');
    const fakeReq = {
      method: 'POST',
      originalUrl: '/api/test',
      body: { username: 'alice', password: 'secret123' },
      user: { id: 1 },
    };

    await logErrorToDb(error, fakeReq);

    const entry = await prisma.errorLog.findFirst({
      where: { message: '[TEST] Something broke' },
    });
    expect(entry).not.toBeNull();
    expect(entry.method).toBe('POST');
    expect(entry.url).toBe('/api/test');
    expect(entry.userId).toBe(1);
    expect(entry.stack).toContain('Something broke');
  });

  it('sanitizes sensitive fields in body', async () => {
    const error = new Error('[TEST] Sensitive body check');
    const fakeReq = {
      method: 'POST',
      originalUrl: '/api/login',
      body: { email: 'a@b.com', password: 'mysecret', token: 'abc' },
    };

    await logErrorToDb(error, fakeReq);

    const entry = await prisma.errorLog.findFirst({
      where: { message: '[TEST] Sensitive body check' },
    });
    expect(entry.body).not.toContain('mysecret');
    expect(entry.body).not.toContain('abc');
    expect(entry.body).toContain('[REDACTED]');
    expect(entry.body).toContain('a@b.com');
  });

  it('handles null request gracefully', async () => {
    const error = new Error('[TEST] No request context');
    await logErrorToDb(error);

    const entry = await prisma.errorLog.findFirst({
      where: { message: '[TEST] No request context' },
    });
    expect(entry).not.toBeNull();
    expect(entry.method).toBeNull();
    expect(entry.url).toBeNull();
    expect(entry.body).toBeNull();
    expect(entry.userId).toBeNull();
  });
});
