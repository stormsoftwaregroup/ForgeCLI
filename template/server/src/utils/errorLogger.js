import prisma from './prisma.js';

const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'authorization'];

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;

  const sanitized = { ...body };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return JSON.stringify(sanitized);
}

export async function logErrorToDb(error, req = null) {
  try {
    return await prisma.errorLog.create({
      data: {
        message: error.message || String(error),
        stack: error.stack || null,
        method: req?.method || null,
        url: req?.originalUrl || null,
        body: req?.body ? sanitizeBody(req.body) : null,
        userId: req?.user?.id || null,
        severity: 'ERROR',
      },
    });
  } catch (dbError) {
    console.error('Failed to log error to database:', dbError.message);
  }
}
