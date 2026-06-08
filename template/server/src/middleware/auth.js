import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

export function authenticate(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid authorization header'));
  }

  try {
    const decoded = verifyAccessToken(header.slice(7));
    req.user = { id: decoded.userId, role: decoded.role };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
}

export function authorizeOwner(paramField) {
  return async (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (req.user.role === 'ADMIN') {
      return next();
    }
    const resourceId = parseInt(req.params[paramField], 10);
    if (req.user.id !== resourceId) {
      return next(new ForbiddenError('You can only access your own resources'));
    }
    next();
  };
}
