import { Router } from 'express';
import customerController from '@controllers/customer.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createCustomerSchema,
  updateCustomerSchema,
  updateCreditLimitSchema,
  updateStatusSchema,
  queryCustomersSchema,
} from '@validators/customer.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/customers/overdue-debt - Get customers with overdue debt (must be before /:id)
router.get(
  '/overdue-debt',
  authorize('GET_CUSTOMER'),
  asyncHandler(customerController.getOverdueDebt.bind(customerController))
);

// GET /api/customers - Get all customers
router.get(
  '/',
  authorize('GET_CUSTOMER'),
  validate(queryCustomersSchema, 'query'),
  asyncHandler(customerController.getAll.bind(customerController))
);

// GET /api/customers/import-template
router.get(
  '/import-template',
  authorize('CREATE_CUSTOMER'),
  asyncHandler(customerController.downloadTemplate.bind(customerController))
);

// GET /api/customers/invoices
router.get(
  '/invoices',
  authorize('GET_CUSTOMER'),
  asyncHandler(customerController.getCustomerInvoices.bind(customerController))
);

// GET /api/customers/purchased-products
router.get(
  '/purchased-products',
  authorize('GET_CUSTOMER'),
  asyncHandler(customerController.getCustomerPurchasedProducts.bind(customerController))
);

// GET /api/customers/:id/overview
router.get(
  '/:id/overview',
  authorize('GET_CUSTOMER'),
  asyncHandler(customerController.getCustomerOverview.bind(customerController))
);

// GET /api/customers/:id/timeline
router.get(
  '/:id/timeline',
  authorize('GET_CUSTOMER'),
  asyncHandler(customerController.getCustomerTimeline.bind(customerController))
);

// GET /api/customers/:id - Get customer by ID
router.get(
  '/:id',
  authorize('GET_CUSTOMER'),
  asyncHandler(customerController.getById.bind(customerController))
);

// POST /api/customers/import - Import customers
router.post(
  '/import',
  authorize('CREATE_CUSTOMER'),
  asyncHandler(customerController.import.bind(customerController))
);

// POST /api/customers - Create new customer
router.post(
  '/',
  authorize('CREATE_CUSTOMER'),
  validate(createCustomerSchema),
  logActivityMiddleware('create', 'customer'),
  asyncHandler(customerController.create.bind(customerController))
);

// PUT /api/customers/:id - Update customer
router.put(
  '/:id',
  authorize('UPDATE_CUSTOMER'),
  validate(updateCustomerSchema),
  logActivityMiddleware('update', 'customer'),
  asyncHandler(customerController.update.bind(customerController))
);

// PUT /api/customers/:id/credit-limit - Update credit limit
router.put(
  '/:id/credit-limit',
  authorize('UPDATE_CUSTOMER'),
  validate(updateCreditLimitSchema),
  logActivityMiddleware('update_credit_limit', 'customer'),
  asyncHandler(customerController.updateCreditLimit.bind(customerController))
);

// PATCH /api/customers/:id/status - Update status
router.patch(
  '/:id/status',
  authorize('UPDATE_CUSTOMER'),
  validate(updateStatusSchema),
  logActivityMiddleware('update_status', 'customer'),
  asyncHandler(customerController.updateStatus.bind(customerController))
);

// GET /api/customers/:id/debt - Get customer debt info
router.get(
  '/:id/debt',
  authorize('GET_CUSTOMER'),
  asyncHandler(customerController.getDebtInfo.bind(customerController))
);

// GET /api/customers/:id/orders - Get customer order history
router.get(
  '/:id/orders',
  authorize('GET_CUSTOMER'),
  asyncHandler(customerController.getOrderHistory.bind(customerController))
);

// DELETE /api/customers/:id - Delete customer
router.delete(
  '/:id',
  authorize('DELETE_CUSTOMER'),
  logActivityMiddleware('delete', 'customer'),
  asyncHandler(customerController.delete.bind(customerController))
);

export default router;
