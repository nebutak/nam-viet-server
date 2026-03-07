import { Router } from 'express';
import unitController from '@controllers/unit.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate, validateMultiple } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
    createUnitSchema,
    updateUnitSchema,
    updateUnitStatusSchema,
    unitQuerySchema,
    unitIdSchema,
    bulkDeleteUnitSchema
} from '@validators/unit.validator';

const router = Router();

// All routes require authentication
router.use(authentication);

router.get(
    '/',
    authorize('GET_PRODUCT'), // Using GET_PRODUCT permission for now as units are closely tied to products
    validate(unitQuerySchema, 'query'),
    asyncHandler(unitController.getAll.bind(unitController))
);

router.get(
    '/:id',
    authorize('GET_PRODUCT'),
    validate(unitIdSchema, 'params'),
    asyncHandler(unitController.getById.bind(unitController))
);

router.post(
    '/',
    authorize('CREATE_PRODUCT'),
    validate(createUnitSchema, 'body'),
    asyncHandler(unitController.create.bind(unitController))
);

router.post(
    '/bulk-delete',
    authorize('DELETE_PRODUCT'),
    validate(bulkDeleteUnitSchema, 'body'),
    asyncHandler(unitController.bulkDelete.bind(unitController))
);

router.put(
    '/:id',
    authorize('UPDATE_PRODUCT'),
    validateMultiple({
        params: unitIdSchema,
        body: updateUnitSchema,
    }),
    asyncHandler(unitController.update.bind(unitController))
);

router.patch(
    '/:id/status',
    authorize('UPDATE_PRODUCT'),
    validateMultiple({
        params: unitIdSchema,
        body: updateUnitStatusSchema,
    }),
    asyncHandler(unitController.updateStatus.bind(unitController))
);

router.delete(
    '/:id',
    authorize('DELETE_PRODUCT'),
    validate(unitIdSchema, 'params'),
    asyncHandler(unitController.delete.bind(unitController))
);

export default router;
