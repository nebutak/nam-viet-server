import { Router } from 'express';
import promotionController from '@controllers/promotion.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  promotionQuerySchema,
  createPromotionSchema,
  updatePromotionSchema,
  approvePromotionSchema,
  cancelPromotionSchema,
  applyPromotionSchema,
  getActivePromotionsSchema,
} from '@validators/promotion.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/promotions - Get all promotions
router.get(
  '/',
  authorize('GET_PROMOTION'),
  validate(promotionQuerySchema, 'query'),
  asyncHandler(promotionController.getAll.bind(promotionController))
);

// GET /api/promotions/active - Get active promotions (before /:id to avoid conflict)
router.get(
  '/active',
  validate(getActivePromotionsSchema, 'query'),
  asyncHandler(promotionController.getActive.bind(promotionController))
);

// POST /api/promotions/auto-expire - Auto expire promotions (cron job)
router.post(
  '/auto-expire',
  authorize('PROMOTION_MANAGEMENT'),
  asyncHandler(promotionController.autoExpire.bind(promotionController))
);

router.get(
  '/statistics',
  authorize('GET_PROMOTION'),
  asyncHandler(promotionController.getStatistics.bind(promotionController))
);
// GET /api/promotions/:id - Get promotion by ID
router.get(
  '/:id',
  authorize('GET_PROMOTION'),
  asyncHandler(promotionController.getById.bind(promotionController))
);

// POST /api/promotions - Create new promotion
router.post(
  '/',
  authorize('CREATE_PROMOTION'),
  validate(createPromotionSchema),
  logActivityMiddleware('create', 'promotion'),
  asyncHandler(promotionController.create.bind(promotionController))
);

// PUT /api/promotions/:id - Update promotion
router.put(
  '/:id',
  authorize('UPDATE_PROMOTION'),
  validate(updatePromotionSchema),
  logActivityMiddleware('update', 'promotion'),
  asyncHandler(promotionController.update.bind(promotionController))
);

// PUT /api/promotions/:id/approve - Approve promotion
router.put(
  '/:id/approve',
  authorize('UPDATE_PROMOTION'),
  validate(approvePromotionSchema),
  logActivityMiddleware('approve', 'promotion'),
  asyncHandler(promotionController.approve.bind(promotionController))
);

// DELETE /api/promotions/:id - Cancel promotion
router.delete(
  '/:id',
  authorize('DELETE_PROMOTION'),
  validate(cancelPromotionSchema),
  logActivityMiddleware('cancel', 'promotion'),
  asyncHandler(promotionController.cancel.bind(promotionController))
);

// DELETE /api/promotions/:id/delete - Delete promotion (soft delete)
router.delete(
  '/:id/delete',
  authorize('DELETE_PROMOTION'),
  logActivityMiddleware('delete', 'promotion'),
  asyncHandler(promotionController.delete.bind(promotionController))
);

// POST /api/promotions/bulk-delete - Bulk delete promotions
router.post(
  '/bulk-delete',
  authorize('DELETE_PROMOTION'),
  logActivityMiddleware('delete', 'promotion'),
  asyncHandler(promotionController.bulkDelete.bind(promotionController))
);

// POST /api/promotions/:id/apply - Apply promotion to order
router.post(
  '/:id/apply',
  validate(applyPromotionSchema),
  logActivityMiddleware('apply', 'promotion'),
  asyncHandler(promotionController.apply.bind(promotionController))
);

export default router;
