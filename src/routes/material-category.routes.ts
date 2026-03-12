import { Router } from 'express';
import materialCategoryController from '@controllers/material-category.controller';
import { authentication } from '@middlewares/auth';
import { asyncHandler } from '@middlewares/errorHandler';

const router = Router();

router.use(authentication);

/**
 * GET /api/material-categories
 * Get all material categories (for dropdowns/selects)
 */
router.get(
    '/',
    asyncHandler(materialCategoryController.getAllMaterialCategories.bind(materialCategoryController))
);

/**
 * POST /api/material-categories
 * Create a new material category
 */
router.post(
    '/',
    asyncHandler(materialCategoryController.createMaterialCategory.bind(materialCategoryController))
);

export default router;
