import { Router } from 'express';
import inventoryController from '@controllers/inventory.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  inventoryQuerySchema,
  warehouseInventorySchema,
  productInventorySchema,
  checkInventorySchema,
  updateInventorySchema,
  adjustInventorySchema,
  reserveInventorySchema,
  releaseReservedSchema,
} from '@validators/inventory.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/inventory/alerts - Get inventory alerts (low stock)
router.get(
  '/alerts',
  authorize('view_inventory'),
  asyncHandler(inventoryController.getAlerts.bind(inventoryController))
);

// GET /api/inventory/low-stock-alerts - Get low stock alerts (alias for /alerts)
router.get(
  '/low-stock-alerts',
  authorize('view_inventory'),
  asyncHandler(inventoryController.getAlerts.bind(inventoryController))
);

// GET /api/inventory/value-report - Get inventory value report
router.get(
  '/value-report',
  authorize('view_inventory', 'view_reports'),
  asyncHandler(inventoryController.getValueReport.bind(inventoryController))
);

// GET /api/inventory/warehouse/:warehouseId - Get inventory by warehouse
router.get(
  '/warehouse/:warehouseId',
  authorize('view_inventory'),
  validate(warehouseInventorySchema, 'params'),
  asyncHandler(inventoryController.getByWarehouse.bind(inventoryController))
);

// GET /api/inventory/product/:productId - Get inventory by product
router.get(
  '/product/:productId',
  authorize('view_inventory'),
  validate(productInventorySchema, 'params'),
  asyncHandler(inventoryController.getByProduct.bind(inventoryController))
);

// POST /api/inventory/check - Check inventory availability
router.post(
  '/check',
  authorize('view_inventory'),
  validate(checkInventorySchema, 'body'),
  logActivityMiddleware('check', 'inventory'),
  asyncHandler(inventoryController.checkAvailability.bind(inventoryController))
);

// POST /api/inventory/reserve - Reserve inventory (for orders)
router.post(
  '/reserve',
  authorize('manage_inventory', 'create_invoices', 'create_production_orders'),
  validate(reserveInventorySchema, 'body'),
  logActivityMiddleware('reserve', 'inventory'),
  asyncHandler(inventoryController.reserve.bind(inventoryController))
);

// POST /api/inventory/release-reserved - Release reserved inventory
router.post(
  '/release-reserved',
  authorize('manage_inventory', 'cancel_invoices', 'cancel_production_orders'),
  validate(releaseReservedSchema, 'body'),
  logActivityMiddleware('reserve reserved', 'inventory'),
  asyncHandler(inventoryController.releaseReserved.bind(inventoryController))
);

// PUT /api/inventory/update - Manual update inventory (admin only)
router.put(
  '/update',
  authorize('manage_inventory'),
  validate(updateInventorySchema, 'body'),
  logActivityMiddleware('update', 'inventory'),
  asyncHandler(inventoryController.update.bind(inventoryController))
);

// POST /api/inventory/adjust - Adjust inventory (increase/decrease)
router.post(
  '/adjust',
  authorize('manage_inventory'),
  validate(adjustInventorySchema, 'body'),
  logActivityMiddleware('adjust', 'inventory'),
  asyncHandler(inventoryController.adjust.bind(inventoryController))
);

// GET /api/inventory - Get all inventory with filters
router.get(
  '/',
  authorize('view_inventory'),
  validate(inventoryQuerySchema, 'query'),
  asyncHandler(inventoryController.getAll.bind(inventoryController))
);

export default router;
