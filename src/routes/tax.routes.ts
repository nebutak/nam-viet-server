import { Router } from 'express';
import taxController from '@controllers/tax.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate, validateMultiple } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
    createTaxSchema,
    updateTaxSchema,
    taxQuerySchema,
    taxIdSchema,
    bulkDeleteTaxSchema
} from '@validators/tax.validator';

const router = Router();

router.use(authentication);

router.get(
    '/',
    authorize('GET_TAX'),
    validate(taxQuerySchema, 'query'),
    asyncHandler(taxController.getAll.bind(taxController))
);

router.get(
    '/import-template',
    authorize('GET_TAX'),
    asyncHandler(taxController.downloadImportTemplate.bind(taxController))
);

router.post(
    '/import',
    authorize('CREATE_TAX'),
    asyncHandler(taxController.import.bind(taxController))
);

router.get(
    '/:id',
    authorize('GET_TAX'),
    validate(taxIdSchema, 'params'),
    asyncHandler(taxController.getById.bind(taxController))
);

router.post(
    '/',
    authorize('CREATE_TAX'),
    validate(createTaxSchema, 'body'),
    asyncHandler(taxController.create.bind(taxController))
);

router.post(
    '/bulk-delete',
    authorize('DELETE_TAX'),
    validate(bulkDeleteTaxSchema, 'body'),
    asyncHandler(taxController.bulkDelete.bind(taxController))
);

router.put(
    '/:id',
    authorize('UPDATE_TAX'),
    validateMultiple({ params: taxIdSchema, body: updateTaxSchema }),
    asyncHandler(taxController.update.bind(taxController))
);

router.delete(
    '/:id',
    authorize('DELETE_TAX'),
    validate(taxIdSchema, 'params'),
    asyncHandler(taxController.delete.bind(taxController))
);

export default router;
