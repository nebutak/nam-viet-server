import { Router } from 'express';
import stockTransactionController from '@controllers/stock-transaction.controller';
import { authentication } from '@middlewares/auth';
import { authorizeAny } from '@middlewares/authorize';
import { validate, validateMultiple } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  createImportSchema,
  createExportSchema,
  createTransferSchema,
  createDisposalSchema,
  createStocktakeSchema,
  transactionQuerySchema,
  transactionIdSchema,
  postTransactionSchema,
  quickAdjustInventorySchema,
} from '@validators/stock-transaction.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// POST /api/stock-transactions/import - Create import transaction
router.post(
  '/import',
  authorizeAny('CREATE_WAREHOUSE_IMPORT', 'MANAGE_INVENTORY'),
  validate(createImportSchema, 'body'),
  logActivityMiddleware('import', 'stock_transaction'),
  asyncHandler(stockTransactionController.createImport.bind(stockTransactionController))
);

// POST /api/stock-transactions/export - Create export transaction
router.post(
  '/export',
  authorizeAny('CREATE_WAREHOUSE_EXPORT', 'MANAGE_INVENTORY'),
  validate(createExportSchema, 'body'),
  logActivityMiddleware('export', 'stock_transaction'),
  asyncHandler(stockTransactionController.createExport.bind(stockTransactionController))
);

// POST /api/stock-transactions/transfer - Create transfer transaction
router.post(
  '/transfer',
  authorizeAny('MANAGE_INVENTORY'),
  validate(createTransferSchema, 'body'),
  logActivityMiddleware('transfer', 'stock_transaction'),
  asyncHandler(stockTransactionController.createTransfer.bind(stockTransactionController))
);

// POST /api/stock-transactions/disposal - Create disposal transaction
router.post(
  '/disposal',
  authorizeAny('MANAGE_INVENTORY'),
  validate(createDisposalSchema, 'body'),
  logActivityMiddleware('disposal', 'stock_transaction'),
  asyncHandler(stockTransactionController.createDisposal.bind(stockTransactionController))
);

// POST /api/stock-transactions/stocktake - Create stocktake transaction
router.post(
  '/stocktake',
  authorizeAny('MANAGE_INVENTORY'),
  validate(createStocktakeSchema, 'body'),
  logActivityMiddleware('stocktake', 'stock_transaction'),
  asyncHandler(stockTransactionController.createStocktake.bind(stockTransactionController))
);

// PUT /api/stock-transactions/:id/post - Post transaction
router.put(
  '/:id/post',
  authorizeAny('POSTED_WAREHOUSE_IMPORT', 'POSTED_WAREHOUSE_EXPORT', 'MANAGE_INVENTORY'),
  validateMultiple({
    params: transactionIdSchema,
    body: postTransactionSchema,
  }),
  logActivityMiddleware('post', 'stock_transaction'),
  asyncHandler(stockTransactionController.post.bind(stockTransactionController))
);


// POST /api/stock-transactions/quick-adjust - Quick adjust inventory
router.post(
  '/quick-adjust',
  authorizeAny('MANAGE_INVENTORY'),
  validate(quickAdjustInventorySchema, 'body'),
  logActivityMiddleware('quick adjust', 'stock_transaction'),
  asyncHandler(stockTransactionController.quickAdjustInventory.bind(stockTransactionController))
);

// GET /api/stock-transactions/card/:warehouseId/:productId - Get stock card
router.get(
  '/card/:warehouseId/:productId',
  authorizeAny('GET_STOCK', 'MANAGE_INVENTORY', 'INVENTORY_LEDGER_VIEW'),
  asyncHandler(stockTransactionController.getStockCard.bind(stockTransactionController))
);

// GET /api/stock-transactions/:id - Get transaction by ID
router.get(
  '/:id',
  authorizeAny('GET_WAREHOUSE_IMPORT', 'GET_WAREHOUSE_EXPORT', 'GET_STOCK', 'MANAGE_INVENTORY'),
  validate(transactionIdSchema, 'params'),
  asyncHandler(stockTransactionController.getById.bind(stockTransactionController))
);

// GET /api/stock-transactions - Get all transactions
router.get(
  '/',
  authorizeAny('GET_WAREHOUSE_IMPORT', 'GET_WAREHOUSE_EXPORT', 'GET_STOCK', 'MANAGE_INVENTORY'),
  validate(transactionQuerySchema, 'query'),
  asyncHandler(stockTransactionController.getAll.bind(stockTransactionController))
);

export default router;
