import { Router } from 'express';
import attributeController from '@controllers/attribute.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate, validateMultiple } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
    createAttributeSchema,
    updateAttributeSchema,
    attributeQuerySchema,
    attributeIdSchema,
    bulkDeleteAttributeSchema
} from '@validators/attribute.validator';

const router = Router();

router.use(authentication);

router.get(
    '/',
    authorize('GET_ATTRIBUTE'),
    validate(attributeQuerySchema, 'query'),
    asyncHandler(attributeController.getAll.bind(attributeController))
);

router.post(
    '/bulk-delete',
    authorize('DELETE_ATTRIBUTE'),
    validate(bulkDeleteAttributeSchema, 'body'),
    asyncHandler(attributeController.bulkDelete.bind(attributeController))
);

router.post(
    '/import',
    authorize('CREATE_ATTRIBUTE'),
    asyncHandler(attributeController.import.bind(attributeController))
);

router.get(
    '/import-template',
    authorize('CREATE_ATTRIBUTE'),
    asyncHandler(attributeController.downloadTemplate.bind(attributeController))
);

router.get(
    '/:id',
    authorize('GET_ATTRIBUTE'),
    validate(attributeIdSchema, 'params'),
    asyncHandler(attributeController.getById.bind(attributeController))
);

router.post(
    '/',
    authorize('CREATE_ATTRIBUTE'),
    validate(createAttributeSchema, 'body'),
    asyncHandler(attributeController.create.bind(attributeController))
);

router.put(
    '/:id',
    authorize('UPDATE_ATTRIBUTE'),
    validateMultiple({ params: attributeIdSchema, body: updateAttributeSchema }),
    asyncHandler(attributeController.update.bind(attributeController))
);

router.delete(
    '/:id',
    authorize('DELETE_ATTRIBUTE'),
    validate(attributeIdSchema, 'params'),
    asyncHandler(attributeController.delete.bind(attributeController))
);

export default router;
