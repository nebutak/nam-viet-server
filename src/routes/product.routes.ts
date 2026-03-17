import { Router } from 'express';
import productController from '@controllers/product.controller';
import { authentication } from '@middlewares/auth';
import { authorize, authorizeAny } from '@middlewares/authorize';
import { validate, validateMultiple } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  productIdSchema,
  updateFeaturedSchema,
} from '@validators/product.validator';
import { logActivityMiddleware } from '@middlewares/logger';
import uploadService from '@services/upload.service';
import { parseFormData } from '@middlewares/parseFormData';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/products/stats/overview
router.get(
  '/stats/overview',
  authorize('GET_PRODUCT'),

  asyncHandler(productController.getStats.bind(productController))
);

// GET /api/products/stats/raw-materials
router.get(
  '/stats/raw-materials',
  authorize('GET_PRODUCT'),
  asyncHandler(productController.getRawMaterialStats.bind(productController))
);

// GET /api/products/stats/packaging
router.get(
  '/stats/packaging',
  authorize('GET_PRODUCT'),
  asyncHandler(productController.getPackagingStats.bind(productController))
);

// GET /api/products/stats/goods
router.get(
  '/stats/goods',
  authorize('GET_PRODUCT'),
  asyncHandler(productController.getGoodsStats.bind(productController))
);

// GET /api/products/low-stock
router.get(
  '/low-stock',
  authorizeAny('GET_PRODUCT', 'GET_INVENTORY', 'MANAGE_INVENTORY'),
  asyncHandler(productController.getLowStock.bind(productController))
);

// GET /api/products/expiring-soon
router.get(
  '/expiring-soon',
  authorizeAny('GET_PRODUCT', 'GET_INVENTORY', 'MANAGE_INVENTORY'),
  asyncHandler(productController.getExpiringSoon.bind(productController))
);

// GET /api/products
router.get(
  '/',
  authorize('GET_PRODUCT'),
  validate(productQuerySchema, 'query'),
  asyncHandler(productController.getAll.bind(productController))
);

// GET /api/products/:id
router.get(
  '/:id',
  authorize('GET_PRODUCT'),
  validate(productIdSchema, 'params'),
  asyncHandler(productController.getById.bind(productController))
);

// POST /api/products
router.post(
  '/',
  authorize('CREATE_PRODUCT'),
  uploadService.getProductUploadMiddleware().single('image'),
  parseFormData,
  validate(createProductSchema, 'body'),
  logActivityMiddleware('create', 'product'),
  asyncHandler(productController.create.bind(productController))
);

router.put(
  '/banner-status',
  authorize('UPDATE_PRODUCT'),
  validate(updateFeaturedSchema, 'body'), // Validate Action & ProductIds
  asyncHandler(productController.updateBannerStatus.bind(productController))
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update product
 *     tags: [Products]
 *     description: Update an existing product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productName:
 *                 type: string
 *               productType:
 *                 type: string
 *                 enum: [raw_material, packaging, finished_product, goods]
 *               categoryId:
 *                 type: integer
 *               supplierId:
 *                 type: integer
 *               purchasePrice:
 *                 type: number
 *               sellingPriceRetail:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [active, inactive, discontinued]
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  '/:id',
  authorize('UPDATE_PRODUCT'),
  uploadService.getProductUploadMiddleware().single('image'),
  parseFormData,
  validateMultiple({
    params: productIdSchema,
    body: updateProductSchema,
  }),
  logActivityMiddleware('update', 'product'),
  asyncHandler(productController.update.bind(productController))
);

// DELETE /api/products/:id
router.delete(
  '/:id',
  authorize('DELETE_PRODUCT'),
  validate(productIdSchema, 'params'),
  logActivityMiddleware('delete', 'product'),
  asyncHandler(productController.delete.bind(productController))
);

// Image and video upload routes removed - use single image field in Product model

export default router;
