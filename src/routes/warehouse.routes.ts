import { Router } from 'express';
import warehouseController from '@controllers/warehouse.controller';
import { authentication } from '@middlewares/auth';
import { authorize, authorizeAny } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  queryWarehousesSchema,
  updateWarehouseStatusSchema,
} from '@validators/warehouse.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

/**
 * GET /api/warehouses/import-template
 * Must precede /:id to avoid ID parsing
 */
router.get(
  '/import-template',
  asyncHandler(warehouseController.getImportTemplate.bind(warehouseController))
);

/**
 * GET /api/warehouses
 * Get all warehouses with pagination, filters, and search
 * Permission: GET_WAREHOUSE
 */
router.get(
  '/',
  authorize('GET_WAREHOUSE'),
  validate(queryWarehousesSchema, 'query'),
  asyncHandler(warehouseController.getAllWarehouses.bind(warehouseController))
);

/**
 * GET /api/warehouses/:id
 * Get warehouse by ID with details
 * Permission: GET_WAREHOUSE
 */
router.get(
  '/:id',
  authorize('GET_WAREHOUSE'),
  asyncHandler(warehouseController.getWarehouseById.bind(warehouseController))
);

/**
 * GET /api/warehouses/:id/statistics
 * Get warehouse statistics (inventory, transactions, capacity)
 * Permission: GET_WAREHOUSE
 */
router.get(
  '/:id/statistics',
  authorize('GET_WAREHOUSE'),
  asyncHandler(warehouseController.getWarehouseStatistics.bind(warehouseController))
);

/**
 * POST /api/warehouses
 * Create new warehouse
 * Permission: CREATE_WAREHOUSE
 * Role: admin, warehouse_manager
 */
router.post(
  '/',
  authorize('CREATE_WAREHOUSE'),
  validate(createWarehouseSchema),
  logActivityMiddleware('create', 'warehouse'),
  asyncHandler(warehouseController.createWarehouse.bind(warehouseController))
);

/**
 * PUT /api/warehouses/:id
 * Update warehouse
 * Permission: WAREHOUSE_MANAGEMENT
 * Role: admin, warehouse_manager
 */
router.put(
  '/:id',
  authorize('UPDATE_WAREHOUSE'),
  validate(updateWarehouseSchema),
  logActivityMiddleware('update', 'warehouse'),
  asyncHandler(warehouseController.updateWarehouse.bind(warehouseController))
);

/**
 * PATCH /api/warehouses/:id/status
 * Update warehouse status
 * Permission: WAREHOUSE_MANAGEMENT
 * Role: admin, warehouse_manager
 */
router.patch(
  '/:id/status',
  authorize('UPDATE_WAREHOUSE'),
  validate(updateWarehouseStatusSchema),
  logActivityMiddleware('update_status', 'warehouse'),
  asyncHandler(warehouseController.updateWarehouseStatus.bind(warehouseController))
);

/**
 * DELETE /api/warehouses/:id
 * Delete warehouse (soft delete - set inactive)
 * Permission: WAREHOUSE_MANAGEMENT
 * Role: admin only
 */
router.delete(
  '/:id',
  authorize('DELETE_WAREHOUSE'),
  logActivityMiddleware('delete', 'warehouse'),
  asyncHandler(warehouseController.deleteWarehouse.bind(warehouseController))
);

/**
 * POST /api/warehouses/import
 * Import warehouses from JSON { items: [] }
 * Permission: WAREHOUSE_MANAGEMENT
 */
router.post(
  '/import',
  authorize('CREATE_WAREHOUSE'),
  logActivityMiddleware('import', 'warehouse'),
  asyncHandler(warehouseController.importWarehouses.bind(warehouseController))
);

/**
 * POST /api/warehouses/bulk-delete
 * Bulk delete warehouses
 * Permission: WAREHOUSE_MANAGEMENT
 */
router.post(
  '/bulk-delete',
  authorize('DELETE_WAREHOUSE'),
  logActivityMiddleware('bulk_delete', 'warehouse'),
  asyncHandler(warehouseController.bulkDelete.bind(warehouseController))
);

export default router;
