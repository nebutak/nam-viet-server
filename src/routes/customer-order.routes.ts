import { Router } from 'express';
import customerOrderController from '@controllers/customer-order.controller';
import { validateNested } from '@middlewares/validate';
import { customerAuthentication } from '@middlewares/authCustomer';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createCustomerInvoiceSchema1,
  customerInvoiceQuerySchema,
} from '@validators/cs-invoice.validator';

const router = Router();

// Secure all endpoints in this router with customer auth
router.use(customerAuthentication);

// POST /api/customer-portal/orders - Create a new order
router.post(
  '/',
  validateNested(createCustomerInvoiceSchema1),
  asyncHandler(customerOrderController.createOrder.bind(customerOrderController))
);

// GET /api/customer-portal/orders - Get orders list
router.get(
  '/',
  validateNested(customerInvoiceQuerySchema),
  asyncHandler(customerOrderController.getOrders.bind(customerOrderController))
);

// GET /api/customer-portal/orders/:id - Get order details
router.get(
  '/:id',
  asyncHandler(customerOrderController.getOrderDetails.bind(customerOrderController))
);

export default router;
