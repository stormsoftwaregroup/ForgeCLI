import prisma from '../utils/prisma.js';
import { NotFoundError } from '../utils/errors.js';

export async function getErrors(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const { severity, startDate, endDate } = req.query;

    const where = {};

    if (severity && ['ERROR', 'WARN', 'INFO'].includes(severity.toUpperCase())) {
      where.severity = severity.toUpperCase();
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [errors, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.errorLog.count({ where }),
    ]);

    res.json({
      errors,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
}

export async function getErrorById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const error = await prisma.errorLog.findUnique({ where: { id } });

    if (!error) {
      throw new NotFoundError('Error log entry not found');
    }

    res.json({ error });
  } catch (err) {
    next(err);
  }
}

export async function deleteOldErrors(req, res, next) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count } = await prisma.errorLog.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });

    res.json({ message: `Deleted ${count} error(s) older than 30 days`, count });
  } catch (err) {
    next(err);
  }
}
