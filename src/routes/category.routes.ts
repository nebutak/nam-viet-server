import { Router } from 'express';
import categoryController from '@controllers/category.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createCategorySchema,
  updateCategorySchema,
  queryCategoriesSchema,
} from '@validators/category.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

/**
 * GET /api/categories
 * Get all categories with pagination, filters, and search
 * Permission: view_categories
 */
router.get(
  '/',
  authorize('GET_CATEGORY'),
  validate(queryCategoriesSchema, 'query'),
  asyncHandler(categoryController.getAllCategories.bind(categoryController))
);

/**
 * GET /api/categories/stats/overview
 * Get category statistics (total, active, inactive, top categories)
 * Permission: view_categories
 */
router.get(
  '/stats/overview',
  authorize('view_categories'),
  asyncHandler(categoryController.getCategoryStats.bind(categoryController))
);

/**
 * GET /api/categories/tree
 * Get category tree structure (hierarchical)
 * Permission: view_categories
 */
router.get(
  '/tree',
  authorize('view_categories'),
  asyncHandler(categoryController.getCategoryTree.bind(categoryController))
);

/**
 * GET /api/categories/:id
 * Get category by ID with details
 * Permission: view_categories
 */
router.get(
  '/:id',
  authorize('view_categories'),
  asyncHandler(categoryController.getCategoryById.bind(categoryController))
);

/**
 * POST /api/categories
 * Create new category
 * Permission: create_category
 */
router.post(
  '/',
  authorize('create_category'),
  validate(createCategorySchema),
  logActivityMiddleware('create', 'category'),
  asyncHandler(categoryController.createCategory.bind(categoryController))
);

/**
 * PUT /api/categories/:id
 * Update category
 * Permission: update_category
 */
router.put(
  '/:id',
  authorize('update_category'),
  validate(updateCategorySchema),
  logActivityMiddleware('update', 'category'),
  asyncHandler(categoryController.updateCategory.bind(categoryController))
);

/**
 * DELETE /api/categories/:id
 * Delete category (soft delete - set inactive)
 * Permission: delete_category
 */
router.delete(
  '/:id',
  authorize('delete_category'),
  logActivityMiddleware('delete', 'category'),
  asyncHandler(categoryController.deleteCategory.bind(categoryController))
);

export default router;
