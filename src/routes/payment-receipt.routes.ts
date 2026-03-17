import { Router } from 'express';
import paymentReceiptController from '@controllers/payment-receipt.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createPaymentReceiptSchema,
  updatePaymentReceiptSchema,
  postReceiptSchema,
  paymentReceiptQuerySchema,
} from '@validators/payment-receipt.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/payment-receipts/summary - Get summary (must be before /:id)
router.get(
  '/summary',
  authorize('GET_RECEIPT'),
  asyncHandler(paymentReceiptController.getSummary.bind(paymentReceiptController))
);

// GET /api/payment-receipts/customer/:customerId - Get by customer (must be before /:id)
router.get(
  '/customer/:customerId',
  authorize('GET_RECEIPT'),
  asyncHandler(paymentReceiptController.getByCustomer.bind(paymentReceiptController))
);

// GET /api/payment-receipts - Get all payment receipts
router.get(
  '/',
  authorize('GET_RECEIPT'),
  validate(paymentReceiptQuerySchema, 'query'),
  asyncHandler(paymentReceiptController.getAll.bind(paymentReceiptController))
);

// GET /api/payment-receipts/my-receipts - Get current user receipts
router.get(
  '/my-receipts',
  authorize('GET_RECEIPT'),
  asyncHandler(paymentReceiptController.getMyReceipts.bind(paymentReceiptController))
);

// GET /api/payment-receipts/:id - Get payment receipt by ID
router.get(
  '/:id',
  authorize('GET_RECEIPT'),
  asyncHandler(paymentReceiptController.getById.bind(paymentReceiptController))
);

// GET /api/payment-receipts/:id/qr-code - Get VietQR code link
router.get(
  '/:id/qr-code',
  authorize('GET_RECEIPT'),
  asyncHandler(paymentReceiptController.getQRCode.bind(paymentReceiptController))
);

// POST /api/payment-receipts - Create new payment receipt
router.post(
  '/',
  authorize('CREATE_RECEIPT'),
  validate(createPaymentReceiptSchema),
  logActivityMiddleware('create', 'payment_receipt'),
  asyncHandler(paymentReceiptController.create.bind(paymentReceiptController))
);

// PUT /api/payment-receipts/:id - Update payment receipt
router.put(
  '/:id',
  authorize('UPDATE_RECEIPT'),
  validate(updatePaymentReceiptSchema),
  logActivityMiddleware('update', 'payment_receipt'),
  asyncHandler(paymentReceiptController.update.bind(paymentReceiptController))
);

// POST /api/payment-receipts/:id/post - Post receipt to accounting
router.post(
  '/:id/post',
  authorize('POSTED_RECEIPT'),
  validate(postReceiptSchema),
  logActivityMiddleware('post', 'payment_receipt'),
  asyncHandler(paymentReceiptController.post.bind(paymentReceiptController))
);

// POST /api/payment-receipts/:id/unpost - Unpost receipt
router.post(
  '/:id/unpost',
  authorize('POSTED_RECEIPT'), // Use same permission as post
  logActivityMiddleware('unpost', 'payment_receipt'),
  asyncHandler(paymentReceiptController.unpost.bind(paymentReceiptController))
);

// POST /api/payment-receipts/:id/send-email - Send email receipt
router.post(
  '/:id/send-email',
  authorize('GET_RECEIPT'),
  logActivityMiddleware('send_email', 'payment_receipt'),
  asyncHandler(paymentReceiptController.sendEmail.bind(paymentReceiptController))
);

// DELETE /api/payment-receipts/:id - Delete payment receipt
router.delete(
  '/:id',
  authorize('DELETE_RECEIPT'),
  logActivityMiddleware('delete', 'payment_receipt'),
  asyncHandler(paymentReceiptController.delete.bind(paymentReceiptController))
);

export default router;
