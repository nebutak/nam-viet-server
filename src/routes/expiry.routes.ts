import { Router } from 'express';
import expiryController from '@controllers/expiry.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import { createExpirySchema, updateExpirySchema, getExpiryAccountsParams } from '@validators/expiry.validator';

const router = Router();

// All routes require authentication
router.use(authentication);

router.get(
  '/',
  authorize('GET_EXPIRY'),
  asyncHandler(expiryController.getAllAccountsWithExpiries.bind(expiryController))
);

router.get(
  '/:id',
  authorize('GET_EXPIRY_USER'),
  asyncHandler(expiryController.getExpiryById.bind(expiryController))
);

router.post(
  '/',
  authorize('CREATE_EXPIRY'),
  validate(createExpirySchema),
  asyncHandler(expiryController.createExpiry.bind(expiryController))
);

router.put(
  '/:id',
  authorize('UPDATE_EXPIRY'),
  validate(updateExpirySchema),
  asyncHandler(expiryController.updateExpiry.bind(expiryController))
);

router.delete(
  '/:id',
  authorize('DELETE_EXPIRY'),
  asyncHandler(expiryController.deleteExpiry.bind(expiryController))
);

router.get(
  '/customer/:id',
  authorize('GET_EXPIRY'),
  validate(getExpiryAccountsParams, 'query'),
  asyncHandler(expiryController.getAccountsByCustomerId.bind(expiryController))
);

router.delete(
  '/account/:id',
  authorize('DELETE_EXPIRY'),
  asyncHandler(expiryController.deleteAccount.bind(expiryController))
);

export default router;
