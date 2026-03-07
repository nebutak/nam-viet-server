import { Router } from 'express';
import userPermissionController from '@controllers/user-permission.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { asyncHandler } from '@middlewares/errorHandler';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/users/:id/permissions - Get user's direct permissions
router.get(
  '/:id/permissions',
  authorize('GET_USER'),
  asyncHandler(userPermissionController.getUserPermissions.bind(userPermissionController))
);

// POST /api/users/:id/permissions - Assign permission to user
router.post(
  '/:id/permissions',
  authorize('UPDATE_USER'),
  asyncHandler(userPermissionController.assignUserPermission.bind(userPermissionController))
);

// DELETE /api/users/:id/permissions/:permissionId - Revoke permission from user
router.delete(
  '/:id/permissions/:permissionId',
  authorize('UPDATE_USER'),
  asyncHandler(userPermissionController.revokeUserPermission.bind(userPermissionController))
);

// GET /api/users/:id/permissions/effective - Get effective permissions
router.get(
  '/:id/permissions/effective',
  authorize('GET_USER'),
  asyncHandler(userPermissionController.getEffectivePermissions.bind(userPermissionController))
);

export default router;
