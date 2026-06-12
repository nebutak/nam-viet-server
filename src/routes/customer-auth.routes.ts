import { Router } from 'express';
import { z } from 'zod';
import customerAuthController from '@controllers/customer-auth.controller';
import { validateNested } from '@middlewares/validate';
import { loginPasswordSchema, googleLoginSchema } from '@validators/customer_account.validator';
import { asyncHandler } from '@middlewares/errorHandler';
import { customerAuthentication } from '@middlewares/authCustomer';

const router = Router();

// Zod validation schema for customer registration
const registerSchema = z.object({
  body: z.object({
    customerName: z.string().min(1, 'Họ và tên là bắt buộc'),
    phone: z.string().min(9, 'Số điện thoại phải chứa ít nhất 9 chữ số').regex(/^[0-9]+$/, 'Số điện thoại chỉ được chứa số'),
    email: z.string().email('Email không đúng định dạng').optional().nullable(),
    address: z.string().optional().nullable(),
    password: z.string().min(6, 'Mật khẩu phải chứa ít nhất 6 ký tự'),
  }),
});

// POST /api/customer-portal/auth/register - Register a new customer
router.post(
  '/register',
  validateNested(registerSchema),
  asyncHandler(customerAuthController.register.bind(customerAuthController))
);

// POST /api/customer-portal/auth/login - Login customer using phone and password
router.post(
  '/login',
  validateNested(loginPasswordSchema),
  asyncHandler(customerAuthController.login.bind(customerAuthController))
);

// POST /api/customer-portal/auth/google - Login or Register customer using Google ID token
router.post(
  '/google',
  validateNested(googleLoginSchema),
  asyncHandler(customerAuthController.googleLogin.bind(customerAuthController))
);

// POST /api/customer-portal/auth/logout - Logout customer
router.post(
  '/logout',
  customerAuthentication,
  asyncHandler(customerAuthController.logout.bind(customerAuthController))
);

export default router;
