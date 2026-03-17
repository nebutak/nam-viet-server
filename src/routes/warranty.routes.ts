import { Router } from 'express';
import warrantyController from '@controllers/warranty.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createWarrantySchema,
  updateWarrantyStatusSchema,
  warrantyQuerySchema,
  sendReminderEmailSchema,
} from '@validators/warranty.validator';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/warranty
router.get(
  '/',
  authorize('GET_WARRANTY'),
  validate(warrantyQuerySchema, 'query'),
  asyncHandler(warrantyController.getAll.bind(warrantyController))
);

// GET /api/warranty/:id
router.get(
  '/:id',
  authorize('GET_WARRANTY'),
  asyncHandler(warrantyController.getById.bind(warrantyController))
);

// POST /api/warranty
router.post(
  '/',
  authorize('CREATE_WARRANTY'),
  validate(createWarrantySchema),
  asyncHandler(warrantyController.create.bind(warrantyController))
);

// PUT /api/warranty/:id/update-status
router.put(
  '/:id/update-status',
  authorize('UPDATE_WARRANTY'),
  validate(updateWarrantyStatusSchema),
  asyncHandler(warrantyController.updateStatus.bind(warrantyController))
);

// DELETE /api/warranty/:id
router.delete(
  '/:id',
  authorize('DELETE_WARRANTY'),
  asyncHandler(warrantyController.delete.bind(warrantyController))
);

// POST /api/warranty/:id/reminder
router.post(
  '/:id/reminder',
  authorize('REMIND_WARRANTY'),
  validate(sendReminderEmailSchema),
  asyncHandler(warrantyController.sendReminder.bind(warrantyController))
);

export default router;
