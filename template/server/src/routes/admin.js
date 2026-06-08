import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate, authorize('ADMIN'));

/**
 * @openapi
 * /admin/errors:
 *   get:
 *     summary: List error logs with pagination and filters
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [ERROR, WARN, INFO]
 *         description: Filter by severity
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter errors from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter errors until this date
 *     responses:
 *       200:
 *         description: Paginated error logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ErrorLog'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get('/errors', adminController.getErrors);

/**
 * @openapi
 * /admin/errors/{id}:
 *   get:
 *     summary: Get a single error log with full stack trace
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Error log ID
 *     responses:
 *       200:
 *         description: Error log detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   $ref: '#/components/schemas/ErrorLog'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Error log entry not found
 */
router.get('/errors/:id', adminController.getErrorById);

/**
 * @openapi
 * /admin/errors/cleanup:
 *   delete:
 *     summary: Delete error logs older than 30 days
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Deleted 42 error(s) older than 30 days
 *                 count:
 *                   type: integer
 *                   example: 42
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.delete('/errors/cleanup', adminController.deleteOldErrors);

/**
 * @openapi
 * components:
 *   schemas:
 *     ErrorLog:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         message:
 *           type: string
 *         stack:
 *           type: string
 *           nullable: true
 *         method:
 *           type: string
 *           nullable: true
 *         url:
 *           type: string
 *           nullable: true
 *         body:
 *           type: string
 *           nullable: true
 *         userId:
 *           type: integer
 *           nullable: true
 *         severity:
 *           type: string
 *           enum: [ERROR, WARN, INFO]
 *         createdAt:
 *           type: string
 *           format: date-time
 */

export default router;
