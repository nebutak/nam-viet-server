import { Router } from 'express';
import supplierController from '@controllers/supplier.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createSupplierSchema,
  updateSupplierSchema,
  updateSupplierStatusSchema,
  querySuppliersSchema,
} from '@validators/supplier.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/suppliers
router.get(
  '/',
  authorize('GET_SUPPLIER'),
  validate(querySuppliersSchema, 'query'),
  asyncHandler(supplierController.getAllSuppliers.bind(supplierController))
);

// Import/Export/Bulk Actions (must be before /:id)
router.post('/bulk-delete', authorize('DELETE_SUPPLIER'), asyncHandler(supplierController.bulkDelete.bind(supplierController)));
router.post('/import', asyncHandler(supplierController.import.bind(supplierController)));
router.get('/import-template', asyncHandler(supplierController.downloadTemplate.bind(supplierController)));

// GET /api/suppliers/:id
router.get(
  '/:id',
  authorize('GET_SUPPLIER'),
  asyncHandler(supplierController.getSupplierById.bind(supplierController))
);

// GET /api/suppliers/:id/products
router.get(
  '/:id/products',
  authorize('GET_SUPPLIER'),
  asyncHandler(supplierController.getSupplierWithProducts.bind(supplierController))
);

// POST /api/suppliers
router.post(
  '/',
  authorize('CREATE_SUPPLIER'),
  validate(createSupplierSchema),
  logActivityMiddleware('create', 'supplier'),
  asyncHandler(supplierController.createSupplier.bind(supplierController))
);

// PUT /api/suppliers/:id
router.put(
  '/:id',
  authorize('UPDATE_SUPPLIER'),
  validate(updateSupplierSchema),
  logActivityMiddleware('update', 'supplier'),
  asyncHandler(supplierController.updateSupplier.bind(supplierController))
);

// PATCH /api/suppliers/:id/status
router.patch(
  '/:id/status',
  authorize('UPDATE_SUPPLIER'),
  validate(updateSupplierStatusSchema),
  logActivityMiddleware('update', 'supplier'),
  asyncHandler(supplierController.updateSupplierStatus.bind(supplierController))
);

// SOFT DELETE /api/suppliers/:id
router.delete(
  '/:id',
  authorize('DELETE_SUPPLIER'),
  asyncHandler(supplierController.delete.bind(supplierController))
);

export default router;
