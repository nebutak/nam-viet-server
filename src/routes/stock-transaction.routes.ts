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
  approveTransactionSchema,
  cancelTransactionSchema,
  quickAdjustInventorySchema,
} from '@validators/stock-transaction.validator';
import { logActivityMiddleware } from '@middlewares/logger';

const router = Router();

// All routes require authentication
router.use(authentication);

// POST /api/stock-transactions/import - Create import transaction
router.post(
  '/import',
  authorizeAny('CREATE_WAREHOUSE_RECEIPT', 'WAREHOUSE_IMPORT_CREATE', 'STOCK_MANAGEMENT'),
  validate(createImportSchema, 'body'),
  logActivityMiddleware('import', 'stock_transaction'),
  asyncHandler(stockTransactionController.createImport.bind(stockTransactionController))
);

// POST /api/stock-transactions/export - Create export transaction
router.post(
  '/export',
  authorizeAny('WAREHOUSE_EXPORT_CREATE', 'STOCK_MANAGEMENT'),
  validate(createExportSchema, 'body'),
  logActivityMiddleware('export', 'stock_transaction'),
  asyncHandler(stockTransactionController.createExport.bind(stockTransactionController))
);

// POST /api/stock-transactions/transfer - Create transfer transaction
router.post(
  '/transfer',
  authorizeAny('STOCK_MANAGEMENT'),
  validate(createTransferSchema, 'body'),
  logActivityMiddleware('transfer', 'stock_transaction'),
  asyncHandler(stockTransactionController.createTransfer.bind(stockTransactionController))
);

// POST /api/stock-transactions/disposal - Create disposal transaction
router.post(
  '/disposal',
  authorizeAny('STOCK_MANAGEMENT'),
  validate(createDisposalSchema, 'body'),
  logActivityMiddleware('disposal', 'stock_transaction'),
  asyncHandler(stockTransactionController.createDisposal.bind(stockTransactionController))
);

// POST /api/stock-transactions/stocktake - Create stocktake transaction
router.post(
  '/stocktake',
  authorizeAny('STOCK_MANAGEMENT'),
  validate(createStocktakeSchema, 'body'),
  logActivityMiddleware('stocktake', 'stock_transaction'),
  asyncHandler(stockTransactionController.createStocktake.bind(stockTransactionController))
);

// PUT /api/stock-transactions/:id/approve - Approve transaction
router.put(
  '/:id/approve',
  authorizeAny('POST_WAREHOUSE_RECEIPT', 'WAREHOUSE_IMPORT_POST', 'WAREHOUSE_EXPORT_POST', 'STOCK_MANAGEMENT'),
  validateMultiple({
    params: transactionIdSchema,
    body: approveTransactionSchema,
  }),
  logActivityMiddleware('approve', 'stock_transaction'),
  asyncHandler(stockTransactionController.approve.bind(stockTransactionController))
);

// PUT /api/stock-transactions/:id/cancel - Cancel transaction
router.put(
  '/:id/cancel',
  authorizeAny('WAREHOUSE_IMPORT_CANCEL', 'WAREHOUSE_EXPORT_CANCEL', 'STOCK_MANAGEMENT'),
  validateMultiple({
    params: transactionIdSchema,
    body: cancelTransactionSchema,
  }),
  logActivityMiddleware('cancel', 'stock_transaction'),
  asyncHandler(stockTransactionController.cancel.bind(stockTransactionController))
);

// POST /api/stock-transactions/quick-adjust - Quick adjust inventory
router.post(
  '/quick-adjust',
  authorizeAny('STOCK_MANAGEMENT'),
  validate(quickAdjustInventorySchema, 'body'),
  logActivityMiddleware('quick adjust', 'stock_transaction'),
  asyncHandler(stockTransactionController.quickAdjustInventory.bind(stockTransactionController))
);

// GET /api/stock-transactions/card/:warehouseId/:productId - Get stock card
router.get(
  '/card/:warehouseId/:productId',
  authorizeAny('GET_STOCK', 'STOCK_MANAGEMENT', 'INVENTORY_LEDGER_VIEW'),
  asyncHandler(stockTransactionController.getStockCard.bind(stockTransactionController))
);

// GET /api/stock-transactions/:id - Get transaction by ID
router.get(
  '/:id',
  authorizeAny('GET_WAREHOUSE_RECEIPT', 'WAREHOUSE_IMPORT_VIEW_ALL', 'WAREHOUSE_EXPORT_VIEW_ALL', 'GET_STOCK', 'STOCK_MANAGEMENT'),
  validate(transactionIdSchema, 'params'),
  asyncHandler(stockTransactionController.getById.bind(stockTransactionController))
);

// GET /api/stock-transactions - Get all transactions
router.get(
  '/',
  authorizeAny('GET_WAREHOUSE_RECEIPT', 'WAREHOUSE_IMPORT_VIEW_ALL', 'WAREHOUSE_EXPORT_VIEW_ALL', 'GET_STOCK', 'STOCK_MANAGEMENT'),
  validate(transactionQuerySchema, 'query'),
  asyncHandler(stockTransactionController.getAll.bind(stockTransactionController))
);

export default router;
