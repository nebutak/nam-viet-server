import { Router } from 'express';
import paymentVoucherController from '@controllers/payment-voucher.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createPaymentVoucherSchema,
  updatePaymentVoucherSchema,
  postVoucherSchema,
  paymentVoucherQuerySchema,
} from '@validators/payment-voucher.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/payment-vouchers/statistics - Get statistics (must be before /:id)
router.get(
  '/statistics',
  authorize('GET_PAYMENT'),
  asyncHandler(paymentVoucherController.getStatistics.bind(paymentVoucherController))
);

// GET /api/payment-vouchers/report/expense - Get expense report (must be before /:id)
router.get(
  '/report/expense',
  authorize('GET_PAYMENT'),
  asyncHandler(paymentVoucherController.getExpenseReport.bind(paymentVoucherController))
);

// GET /api/payment-vouchers/summary - Get summary (must be before /:id)
router.get(
  '/summary',
  authorize('GET_PAYMENT'),
  asyncHandler(paymentVoucherController.getSummary.bind(paymentVoucherController))
);

// GET /api/payment-vouchers/supplier/:supplierId - Get by supplier (must be before /:id)
router.get(
  '/supplier/:supplierId',
  authorize('GET_PAYMENT'),
  asyncHandler(paymentVoucherController.getBySupplier.bind(paymentVoucherController))
);

// GET /api/payment-vouchers - Get all payment vouchers
router.get(
  '/',
  authorize('GET_PAYMENT'),
  validate(paymentVoucherQuerySchema, 'query'),
  asyncHandler(paymentVoucherController.getAll.bind(paymentVoucherController))
);

// GET /api/payment-vouchers/my-payment-vouchers - Get current user vouchers
router.get(
  '/my-payment-vouchers',
  authorize('GET_PAYMENT'),
  asyncHandler(paymentVoucherController.getMyPayments.bind(paymentVoucherController))
);

// GET /api/payment-vouchers/:id - Get payment voucher by ID
router.get(
  '/:id',
  authorize('GET_PAYMENT'),
  asyncHandler(paymentVoucherController.getById.bind(paymentVoucherController))
);

// POST /api/payment-vouchers - Create new payment voucher
router.post(
  '/',
  authorize('CREATE_PAYMENT'),
  validate(createPaymentVoucherSchema),
  logActivityMiddleware('create', 'payment_voucher'),
  asyncHandler(paymentVoucherController.create.bind(paymentVoucherController))
);


// PUT /api/payment-vouchers/:id - Update payment voucher
router.put(
  '/:id',
  authorize('UPDATE_PAYMENT'),
  validate(updatePaymentVoucherSchema),
  logActivityMiddleware('update', 'payment_voucher'),
  asyncHandler(paymentVoucherController.update.bind(paymentVoucherController))
);

// POST /api/payment-vouchers/:id/post - Post voucher to accounting
router.post(
  '/:id/post',
  authorize('POSTED_PAYMENT'),
  validate(postVoucherSchema),
  logActivityMiddleware('post', 'payment_voucher'),
  asyncHandler(paymentVoucherController.post.bind(paymentVoucherController))
);

// POST /api/payment-vouchers/:id/cancel - Cancel voucher
router.post(
  '/:id/cancel',
  authorize('POSTED_PAYMENT'),
  validate(postVoucherSchema),
  logActivityMiddleware('cancel', 'payment_voucher'),
  asyncHandler(paymentVoucherController.cancel.bind(paymentVoucherController))
);

// POST /api/payment-vouchers/bulk-post - Bulk post vouchers
router.post(
  '/bulk-post',
  authorize('POSTED_PAYMENT'),
  logActivityMiddleware('bulkPost', 'payment_voucher'),
  asyncHandler(paymentVoucherController.bulkPost.bind(paymentVoucherController))
);

// DELETE /api/payment-vouchers/:id - Delete payment voucher
router.delete(
  '/:id',
  authorize('DELETE_PAYMENT'),
  logActivityMiddleware('delete', 'payment_voucher'),
  asyncHandler(paymentVoucherController.delete.bind(paymentVoucherController))
);

export default router;
