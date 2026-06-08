import { logErrorToDb } from '../utils/errorLogger.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function errorHandler(err, req, res, _next) {
  // Log to database and get reference ID
  let errorLogId = null;
  try {
    const entry = await logErrorToDb(err, req);
    errorLogId = entry?.id || null;
  } catch {
    // logErrorToDb already handles its own failures
  }

  logger.error(err.message, { stack: err.stack, url: req.originalUrl, method: req.method });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(errorLogId && { ref: errorLogId }),
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction && errorLogId && { ref: errorLogId }),
    ...(!isProduction && { stack: err.stack }),
  });
}
