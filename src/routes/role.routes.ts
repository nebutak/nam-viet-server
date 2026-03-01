import { Router } from 'express';
import roleController from '@controllers/role.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  assignPermissionsSchema,
  createRoleSchema,
  updateRoleSchema,
  deleteRoleSchema,
  queryRolesSchema,
} from '@validators/role.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/roles - Get all roles
router.get(
  '/',
  authorize('GET_ROLE'),
  validate(queryRolesSchema, 'query'),
  asyncHandler(roleController.getAllRoles.bind(roleController))
);

// GET /api/roles/:id - Get role by ID
router.get(
  '/:id',
  authorize('GET_ROLE'),
  asyncHandler(roleController.getRoleById.bind(roleController))
);

// POST /api/roles - Create new role (admin only)
router.post(
  '/',
  authorize('CREATE_ROLE'),
  validate(createRoleSchema),
  logActivityMiddleware('create', 'role'),
  asyncHandler(roleController.createRole.bind(roleController))
);

// PUT /api/roles/:id - Update role (admin only)
router.put(
  '/:id',
  authorize('UPDATE_ROLE'),
  validate(updateRoleSchema),
  logActivityMiddleware('update', 'role'),
  asyncHandler(roleController.updateRole.bind(roleController))
);

// DELETE /api/roles/:id - Delete role (admin only)
router.delete(
  '/:id',
  authorize('DELETE_ROLE'),
  validate(deleteRoleSchema, 'params'),
  logActivityMiddleware('delete', 'role'),
  asyncHandler(roleController.deleteRole.bind(roleController))
);

// GET /api/roles/:id/permissions - Get role permissions
router.get(
  '/:id/permissions',
  authorize('ROLE_MANAGEMENT'),
  asyncHandler(roleController.getRolePermissions.bind(roleController))
);

// PUT /api/roles/:id/permissions - Assign permissions to role (admin only)
router.put(
  '/:id/permissions',
  authorize('ROLE_MANAGEMENT'),
  validate(assignPermissionsSchema),
  logActivityMiddleware('assign', 'permission'),
  asyncHandler(roleController.assignPermissions.bind(roleController))
);

// POST /api/roles/:id/permissions/:permissionId - Add single permission (admin only)
router.post(
  '/:id/permissions/:permissionId',
  authorize('ROLE_MANAGEMENT'),
  logActivityMiddleware('add_single', 'permission'),
  asyncHandler(roleController.addPermission.bind(roleController))
);

// DELETE /api/roles/:id/permissions/:permissionId - Remove single permission (admin only)
router.delete(
  '/:id/permissions/:permissionId',
  authorize('ROLE_MANAGEMENT'),
  logActivityMiddleware('delete', 'permission'),
  asyncHandler(roleController.removePermission.bind(roleController))
);

export default router;
