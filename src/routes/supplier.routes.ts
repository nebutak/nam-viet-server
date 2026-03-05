import { Router } from 'express';
import supplierController from '@controllers/supplier.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createSupplierSchema,
  updateSupplierSchema,
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

// GET /api/suppliers/:id
router.get(
  '/:id',
  authorize('view_suppliers'),
  asyncHandler(supplierController.getSupplierById.bind(supplierController))
);

// POST /api/suppliers
router.post(
  '/',
  authorize('create_supplier'),
  validate(createSupplierSchema),
  logActivityMiddleware('create', 'supplier'),
  asyncHandler(supplierController.createSupplier.bind(supplierController))
);

// PUT /api/suppliers/:id
router.put(
  '/:id',
  authorize('update_supplier'),
  validate(updateSupplierSchema),
  logActivityMiddleware('update', 'supplier'),
  asyncHandler(supplierController.updateSupplier.bind(supplierController))
);

// SOFT DELETE /api/suppliers/:id
router.delete(
  '/:id',
  authorize('delete_supplier'),
  logActivityMiddleware('delete', 'supplier'),
  asyncHandler(supplierController.deleteSupplier.bind(supplierController))
);

export default router;
