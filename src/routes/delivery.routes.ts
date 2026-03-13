import { Router } from 'express';
import deliveryController from '@controllers/delivery.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createDeliverySchema,
  updateDeliverySchema,
  startDeliverySchema,
  completeDeliverySchema,
  failDeliverySchema,
  settleCODSchema,
  deliveryQuerySchema,
} from '@validators/delivery.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/deliveries/unsettled-cod - Get unsettled COD (must be before /:id)
router.get(
  '/unsettled-cod',
  authorize('VIEW_DELIVERY_SETTLEMENT'),
  asyncHandler(deliveryController.getUnsettledCOD.bind(deliveryController))
);

// GET /api/deliveries - Get all deliveries
router.get(
  '/',
  authorize('VIEW_DELIVERIES'),
  validate(deliveryQuerySchema, 'query'),
  asyncHandler(deliveryController.getAll.bind(deliveryController))
);

// GET /api/deliveries/:id - Get delivery by ID
router.get(
  '/:id',
  authorize('VIEW_DELIVERIES'),
  asyncHandler(deliveryController.getById.bind(deliveryController))
);

// POST /api/deliveries - Create new delivery
router.post(
  '/',
  authorize('CREATE_DELIVERY'),
  validate(createDeliverySchema),
  logActivityMiddleware('create', 'delivery'),
  asyncHandler(deliveryController.create.bind(deliveryController))
);

// PUT /api/deliveries/:id - Update delivery
router.put(
  '/:id',
  authorize('UPDATE_DELIVERY'),
  validate(updateDeliverySchema),
  asyncHandler(deliveryController.update.bind(deliveryController))
);

// PUT /api/deliveries/:id/start - Start delivery
router.put(
  '/:id/start',
  authorize('START_DELIVERY'),
  validate(startDeliverySchema),
  asyncHandler(deliveryController.start.bind(deliveryController))
);

// PUT /api/deliveries/:id/complete - Complete delivery
router.put(
  '/:id/complete',
  authorize('COMPLETE_DELIVERY'),
  validate(completeDeliverySchema),
  asyncHandler(deliveryController.complete.bind(deliveryController))
);

// PUT /api/deliveries/:id/fail - Fail delivery
router.put(
  '/:id/fail',
  authorize('FAIL_DELIVERY'),
  validate(failDeliverySchema),
  asyncHandler(deliveryController.fail.bind(deliveryController))
);

// POST /api/deliveries/:id/settle - Settle COD
router.post(
  '/:id/settle',
  authorize('SETTLE_COD'),
  validate(settleCODSchema),
  asyncHandler(deliveryController.settleCOD.bind(deliveryController))
);

// DELETE /api/deliveries/:id - Delete delivery
router.delete(
  '/:id',
  authorize('DELETE_DELIVERY'),
  asyncHandler(deliveryController.delete.bind(deliveryController))
);

export default router;
