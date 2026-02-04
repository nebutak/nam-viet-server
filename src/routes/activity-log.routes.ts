import { Router } from 'express';
import activityLogController from '@controllers/activity-log.controller';
import { authentication } from '@middlewares/auth';
// import { authorize } from '@middlewares/authorize';

const router = Router();

/**
 * @swagger
 * /api/activity-logs:
 *   get:
 *     summary: Get all activity logs
 *     tags: [Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of activity logs
 */
router.get(
  '/',
  authentication,
  // authorize('view_logs'), // Uncomment if permission check is needed
  activityLogController.getAllActivityLogs
);

export default router;
