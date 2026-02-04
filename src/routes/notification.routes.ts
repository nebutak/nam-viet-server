import { Router } from 'express';
import notificationController from '@controllers/notification.controller';
import { authentication } from '@middlewares/auth';
import { requireRole } from '@middlewares/authorize';
import { validateNested } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createNotificationSchema,
  broadcastNotificationSchema,
  getNotificationsQuerySchema,
  notificationIdParamSchema,
} from '@validators/notification.validator';

const router = Router();

// All routes require authentication
router.use(authentication);

// =====================================================
// USER NOTIFICATION ROUTES
// =====================================================

// GET /api/notifications - Get all notifications for current user
router.get(
  '/',
  validateNested(getNotificationsQuerySchema),
  asyncHandler(notificationController.getAll.bind(notificationController))
);

// GET /api/notifications/unread - Get unread notifications
router.get(
  '/unread',
  asyncHandler(notificationController.getUnread.bind(notificationController))
);

// GET /api/notifications/unread-count - Get unread count
router.get(
  '/unread-count',
  asyncHandler(notificationController.getUnreadCount.bind(notificationController))
);

// GET /api/notifications/:id - Get notification by ID
router.get(
  '/:id',
  validateNested(notificationIdParamSchema),
  asyncHandler(notificationController.getById.bind(notificationController))
);

// PUT /api/notifications/:id/read - Mark notification as read
router.put(
  '/:id/read',
  validateNested(notificationIdParamSchema),
  asyncHandler(notificationController.markAsRead.bind(notificationController))
);

// PUT /api/notifications/read-all - Mark all as read
router.put(
  '/read-all',
  asyncHandler(notificationController.markAllAsRead.bind(notificationController))
);

// DELETE /api/notifications/:id - Delete notification
router.delete(
  '/:id',
  validateNested(notificationIdParamSchema),
  asyncHandler(notificationController.delete.bind(notificationController))
);

// DELETE /api/notifications/read - Delete all read notifications
router.delete(
  '/read',
  asyncHandler(notificationController.deleteAllRead.bind(notificationController))
);

// =====================================================
// ADMIN NOTIFICATION ROUTES
// =====================================================

// POST /api/notifications - Create notification (admin only)
router.post(
  '/',
  requireRole('admin'),
  validateNested(createNotificationSchema),
  asyncHandler(notificationController.create.bind(notificationController))
);

// POST /api/notifications/broadcast - Broadcast to users/role (admin only)
router.post(
  '/broadcast',
  requireRole('admin'),
  validateNested(broadcastNotificationSchema),
  asyncHandler(notificationController.broadcast.bind(notificationController))
);

// POST /api/notifications/cleanup/expired - Cleanup expired notifications (admin only)
router.post(
  '/cleanup/expired',
  requireRole('admin'),
  asyncHandler(notificationController.cleanupExpired.bind(notificationController))
);

// POST /api/notifications/cleanup/deleted - Cleanup deleted notifications (admin only)
router.post(
  '/cleanup/deleted',
  requireRole('admin'),
  asyncHandler(notificationController.cleanupDeleted.bind(notificationController))
);

export default router;
