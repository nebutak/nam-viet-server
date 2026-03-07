import { Router } from 'express';
import userController from '@controllers/user.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import { uploadRateLimiter } from '@middlewares/rateLimiter';
import uploadService from '@services/upload.service';
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  queryUsersSchema,
} from '@validators/user.validator';
import userPermissionController from '@controllers/user-permission.controller';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/users/me - Get current user profile
router.get('/me', asyncHandler(userController.getMe.bind(userController)));

// GET /api/users - Get all users
router.get(
  '/',
  validate(queryUsersSchema, 'query'),
  authorize('GET_USER'),
  asyncHandler(userController.getAllUsers.bind(userController))
);

// GET /api/users/:id - Get user by ID
router.get(
  '/:id',
  authorize('GET_USER'),
  asyncHandler(userController.getUserById.bind(userController))
);

// POST /api/users - Create new user
router.post(
  '/',
  authorize('CREATE_USER'),
  validate(createUserSchema),
  logActivityMiddleware('create', 'user'),
  asyncHandler(userController.createUser.bind(userController))
);

// PUT /api/users/:id
router.put(
  '/:id',
  authorize('UPDATE_USER'),
  validate(updateUserSchema),
  logActivityMiddleware('update', 'user'),
  asyncHandler(userController.updateUser.bind(userController))
);

// PUT /api/users/:id/password - Change password
router.put(
  '/:id/password',
  authorize('UPDATE_USER'),
  validate(updateUserSchema),
  logActivityMiddleware('change password', 'user'),
  asyncHandler(userController.changePassword.bind(userController))
);

// DELETE /api/users/:id
router.delete(
  '/:id',
  authorize('DELETE_USER'),
  logActivityMiddleware('delete', 'user'),
  asyncHandler(userController.deleteUser.bind(userController))
);

// PATCH /api/users/:id/status
router.patch(
  '/:id/status',
  authorize('UPDATE_USER'),
  validate(updateUserStatusSchema),
  logActivityMiddleware('update status', 'user'),
  asyncHandler(userController.updateUserStatus.bind(userController))
);

// PATCH /api/users/:id - Toggle Can Edit Profile
router.patch(
  '/:id',
  authorize('UPDATE_USER'),
  logActivityMiddleware('toggle edit profile', 'user'),
  asyncHandler(userController.toggleCanEditProfile.bind(userController))
);

// POST /api/users/:id/avatar
router.post(
  '/:id/avatar',
  authorize('UPDATE_USER'),
  uploadRateLimiter, // Rate limit: 20 uploads per hour
  uploadService.getUploadMiddleware().single('avatar'),
  logActivityMiddleware('upload avatar', 'user'),
  asyncHandler(userController.uploadAvatar.bind(userController))
);

// DELETE /api/users/:id/avatar
router.delete(
  '/:id/avatar',
  authorize('UPDATE_USER'),
  logActivityMiddleware('delete avatar', 'user'),
  asyncHandler(userController.deleteAvatar.bind(userController))
);

// GET /api/users/:id/activity-logs - Get user activity logs
router.get(
  '/:id/activity-logs',
  authorize('GET_USER'),
  asyncHandler(userController.getActivityLogs.bind(userController))
);

// GET /api/users/:id/permissions - Get user's direct permissions
router.get(
  '/:id/permissions',
  authorize('USER_MANAGEMENT'),
  authorize('GET_USER'),
  asyncHandler(userPermissionController.getUserPermissions.bind(userPermissionController))
);

// POST /api/users/:id/permissions - Assign permission to user
router.post(
  '/:id/permissions',
  authorize('USER_MANAGEMENT'),
  authorize('UPDATE_USER'),
  asyncHandler(userPermissionController.assignUserPermission.bind(userPermissionController))
);

// DELETE /api/users/:id/permissions/:permissionId - Revoke permission from user
router.delete(
  '/:id/permissions/:permissionId',
  authorize('USER_MANAGEMENT'),
  authorize('UPDATE_USER'),
  asyncHandler(userPermissionController.revokeUserPermission.bind(userPermissionController))
);

// GET /api/users/:id/permissions/effective - Get effective permissions
router.get(
  '/:id/permissions/effective',
  authorize('USER_MANAGEMENT'),
  authorize('GET_USER'),
  asyncHandler(userPermissionController.getEffectivePermissions.bind(userPermissionController))
);

export default router;
