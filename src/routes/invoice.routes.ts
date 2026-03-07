import { Router } from 'express';
import invoiceController from '@controllers/invoice.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  approveOrderSchema,
  cancelOrderSchema,
  processPaymentSchema,
  invoiceQuerySchema,
} from '@validators/invoice.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/invoices - Get all sales orders
router.get(
  '/',
  authorize('GET_INVOICE'),
  validate(invoiceQuerySchema, 'query'),
  asyncHandler(invoiceController.getAll.bind(invoiceController))
);

// GET /api/invoices/:id - Get sales order by ID
router.get(
  '/:id',
  authorize('GET_INVOICE'),
  asyncHandler(invoiceController.getById.bind(invoiceController))
);

// POST /api/invoices - Create new sales order
router.post(
  '/',
  authorize('CREATE_INVOICE'),
  validate(createInvoiceSchema),
  logActivityMiddleware('create', 'invoice'),
  asyncHandler(invoiceController.create.bind(invoiceController))
);

// PUT /api/invoices/:id - Update sales order
router.put(
  '/:id',
  authorize('UPDATE_INVOICE'),
  validate(updateInvoiceSchema),
  logActivityMiddleware('update', 'invoice'),
  asyncHandler(invoiceController.update.bind(invoiceController))
);

// PUT /api/invoices/:id/approve - Approve order
router.put(
  '/:id/approve',
  authorize('APPROVE_INVOICE'),
  validate(approveOrderSchema),
  logActivityMiddleware('approve', 'invoice'),
  asyncHandler(invoiceController.approve.bind(invoiceController))
);

// PUT /api/invoices/:id/complete - Complete order
router.put(
  '/:id/complete',
  authorize('UPDATE_INVOICE'),
  logActivityMiddleware('complete', 'invoice'),
  asyncHandler(invoiceController.complete.bind(invoiceController))
);

// PUT /api/invoices/:id/cancel - Cancel order
router.put(
  '/:id/cancel',
  authorize('CANCEL_INVOICE'),
  validate(cancelOrderSchema),
  logActivityMiddleware('cancel', 'invoice'),
  asyncHandler(invoiceController.cancel.bind(invoiceController))
);

// POST /api/invoices/:id/payment - Process payment
router.post(
  '/:id/payment',
  authorize('UPDATE_INVOICE'),
  validate(processPaymentSchema),
  logActivityMiddleware('process', 'invoice'),
  asyncHandler(invoiceController.processPayment.bind(invoiceController))
);

// DELETE /api/invoices/:id - Delete order
router.delete(
  '/:id',
  authorize('DELETE_INVOICE'),
  logActivityMiddleware('delete', 'invoice'),
  asyncHandler(invoiceController.delete.bind(invoiceController))
);

export default router;
