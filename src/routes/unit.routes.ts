import { Router } from 'express';
import unitController from '@controllers/unit.controller';
import { authentication } from '@middlewares/auth';
import { authorizeAny } from '@middlewares/authorize';
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
    authorizeAny('GET_PRODUCT', 'GET_UNIT'),
    validate(unitQuerySchema, 'query'),
    asyncHandler(unitController.getAll.bind(unitController))
);

router.get(
    '/:id',
    authorizeAny('GET_PRODUCT', 'GET_UNIT'),
    validate(unitIdSchema, 'params'),
    asyncHandler(unitController.getById.bind(unitController))
);

router.post(
    '/',
    authorizeAny('CREATE_PRODUCT', 'CREATE_UNIT'),
    validate(createUnitSchema, 'body'),
    asyncHandler(unitController.create.bind(unitController))
);

router.post(
    '/bulk-delete',
    authorizeAny('DELETE_PRODUCT', 'DELETE_UNIT'),
    validate(bulkDeleteUnitSchema, 'body'),
    asyncHandler(unitController.bulkDelete.bind(unitController))
);

router.put(
    '/:id',
    authorizeAny('UPDATE_PRODUCT', 'UPDATE_UNIT'),
    validateMultiple({
        params: unitIdSchema,
        body: updateUnitSchema,
    }),
    asyncHandler(unitController.update.bind(unitController))
);

router.patch(
    '/:id/status',
    authorizeAny('UPDATE_PRODUCT', 'UPDATE_UNIT'),
    validateMultiple({
        params: unitIdSchema,
        body: updateUnitStatusSchema,
    }),
    asyncHandler(unitController.updateStatus.bind(unitController))
);

router.delete(
    '/:id',
    authorizeAny('DELETE_PRODUCT', 'DELETE_UNIT'),
    validate(unitIdSchema, 'params'),
    asyncHandler(unitController.delete.bind(unitController))
);

export default router;
