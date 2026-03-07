import { Router } from 'express';
import materialController from '@controllers/material.controller';
import { authentication } from '@middlewares/auth';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
    createMaterialSchema,
    updateMaterialSchema,
    queryMaterialsSchema,
} from '@validators/material.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/materials
router.get(
    '/',
    validate(queryMaterialsSchema, 'query'),
    asyncHandler(materialController.getAllMaterials.bind(materialController))
);

// POST /api/materials/bulk-delete
router.post(
    '/bulk-delete',
    logActivityMiddleware('delete', 'material'),
    asyncHandler(materialController.bulkDeleteMaterials.bind(materialController))
);

// GET /api/materials/:id
router.get(
    '/:id',
    asyncHandler(materialController.getMaterialById.bind(materialController))
);

// POST /api/materials
router.post(
    '/',
    validate(createMaterialSchema),
    logActivityMiddleware('create', 'material'),
    asyncHandler(materialController.createMaterial.bind(materialController))
);

// PUT /api/materials/:id
router.put(
    '/:id',
    validate(updateMaterialSchema),
    logActivityMiddleware('update', 'material'),
    asyncHandler(materialController.updateMaterial.bind(materialController))
);

// DELETE /api/materials/:id
router.delete(
    '/:id',
    logActivityMiddleware('delete', 'material'),
    asyncHandler(materialController.deleteMaterial.bind(materialController))
);

export default router;
