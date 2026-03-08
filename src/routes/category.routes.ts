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
  updateStatusSchema,
  bulkDeleteCategorySchema,
} from '@validators/category.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

/**
 * GET /api/categories
 * Get all categories with pagination, filters, and search
 * Permission: GET_CATEGORY
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
 * Permission: GET_CATEGORY
 */
router.get(
  '/stats/overview',
  authorize('GET_CATEGORY'),
  asyncHandler(categoryController.getCategoryStats.bind(categoryController))
);

/**
 * GET /api/categories/tree
 * Get category tree structure (hierarchical)
 * Permission: GET_CATEGORY
 */
router.get(
  '/tree',
  authorize('GET_CATEGORY'),
  asyncHandler(categoryController.getCategoryTree.bind(categoryController))
);

/**
 * GET /api/categories/import-template
 * Download category import template
 * Permission: CREATE_CATEGORY
 */
router.get(
  '/import-template',
  authorize('CREATE_CATEGORY'),
  asyncHandler(categoryController.downloadTemplate.bind(categoryController))
);

/**
 * POST /api/categories/import
 * Import categories from Excel JSON items
 * Permission: CREATE_CATEGORY
 */
router.post(
  '/import',
  authorize('CREATE_CATEGORY'),
  logActivityMiddleware('import', 'category'),
  asyncHandler(categoryController.import.bind(categoryController))
);

/**
 * GET /api/categories/:id
 * Get category by ID with details
 * Permission: GET_CATEGORY
 */
router.get(
  '/:id',
  authorize('GET_CATEGORY'),
  asyncHandler(categoryController.getCategoryById.bind(categoryController))
);

/**
 * POST /api/categories
 * Create new category
 * Permission: CREATE_CATEGORY
 */
router.post(
  '/',
  authorize('CREATE_CATEGORY'),
  validate(createCategorySchema),
  logActivityMiddleware('create', 'category'),
  asyncHandler(categoryController.createCategory.bind(categoryController))
);

/**
 * PUT /api/categories/:id
 * Update category
 * Permission: UPDATE_CATEGORY
 */
router.put(
  '/:id',
  authorize('UPDATE_CATEGORY'),
  validate(updateCategorySchema),
  logActivityMiddleware('update', 'category'),
  asyncHandler(categoryController.updateCategory.bind(categoryController))
);

/**
 * DELETE /api/categories/:id
 * Delete category (soft delete - set inactive)
 * Permission: DELETE_CATEGORY
 */
router.delete(
  '/:id',
  authorize('DELETE_CATEGORY'),
  logActivityMiddleware('delete', 'category'),
  asyncHandler(categoryController.deleteCategory.bind(categoryController))
);

/**
 * PATCH /api/categories/:id/status
 * Update category status
 * Permission: UPDATE_CATEGORY
 */
router.patch(
  '/:id/status',
  authorize('UPDATE_CATEGORY'),
  validate(updateStatusSchema),
  logActivityMiddleware('update_status', 'category'),
  asyncHandler(categoryController.updateStatus.bind(categoryController))
);

/**
 * POST /api/categories/bulk-delete
 * Delete multiple categories
 * Permission: DELETE_CATEGORY
 */
router.post(
  '/bulk-delete',
  authorize('DELETE_CATEGORY'),
  validate(bulkDeleteCategorySchema),
  logActivityMiddleware('bulk_delete', 'category'),
  asyncHandler(categoryController.bulkDelete.bind(categoryController))
);

/**
 * GET /api/categories/export
 * Export categories to Excel
 * Permission: GET_CATEGORY
 */
router.get(
  '/export',
  authorize('GET_CATEGORY'),
  logActivityMiddleware('export', 'category'),
  asyncHandler(categoryController.exportCategories.bind(categoryController))
);

export default router;
