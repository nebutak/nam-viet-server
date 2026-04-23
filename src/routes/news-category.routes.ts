import { Router } from 'express';
import { NewsCategoryController } from '../controllers/news-category.controller';

const router = Router();

// Public routes
router.get('/', NewsCategoryController.getAllCategories);

// Admin / mutation routes
router.post('/', NewsCategoryController.createCategory);
router.put('/:id', NewsCategoryController.updateCategory);
router.delete('/:id', NewsCategoryController.deleteCategory);

// Must be last to avoid shadowing /:id
router.get('/:slug', NewsCategoryController.getCategoryBySlug);

export default router;
