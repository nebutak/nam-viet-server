import { Router } from 'express';
import financeController from '@controllers/finance.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { asyncHandler } from '@middlewares/errorHandler';

const router = Router();

// Middleware: Require authentication and finance view permission
const requireFinanceView = [authentication, authorize('view_finance_reports')];
const requireFinanceEdit = [authentication, authorize('edit_finance_reports')];

// 1. OVERVIEW/SUMMARY ENDPOINTS
/**
 * GET /api/finance/summary
 * Get KPI summary (4 cards: revenue, expenses, profit, balance)
 */
router.get(
  '/summary',
  ...requireFinanceView,
  asyncHandler(financeController.getSummary.bind(financeController))
);

// 2. CHARTS ENDPOINTS
/**
 * GET /api/finance/charts/cash-flow
 * Get cash flow chart data (income vs expense by date)
 */
router.get(
  '/charts/cash-flow',
  ...requireFinanceView,
  asyncHandler(financeController.getCashFlowChart.bind(financeController))
);

/**
 * GET /api/finance/charts/expenses
 * Get expense structure chart data (breakdown by expense type)
 */
router.get(
  '/charts/expenses',
  ...requireFinanceView,
  asyncHandler(financeController.getExpenseChart.bind(financeController))
);

// 3. REPORTS ENDPOINTS
/**
 * GET /api/finance/reports/pnl
 * Get P&L (Profit & Loss) detailed report
 */
router.get(
  '/reports/pnl',
  ...requireFinanceView,
  asyncHandler(financeController.getPnlReport.bind(financeController))
);

/**
 * GET /api/finance/cash-book
 * Get cash book (all transactions: receipts + payments)
 */
router.get(
  '/cash-book',
  ...requireFinanceView,
  asyncHandler(financeController.getCashBook.bind(financeController))
);

/**
 * GET /api/finance/debts
 * Get debts (customer or supplier)
 * Query: type (customer|supplier), status (all|overdue)
 */
router.get(
  '/debts',
  ...requireFinanceView,
  asyncHandler(financeController.getDebts.bind(financeController))
);

// 4. ACTIONS ENDPOINTS
/**
 * POST /api/finance/cash-fund/close
 * Close cash fund for a specific day
 * Body: { fundDate, notes }
 */
/*
router.post(
  '/cash-fund/close',
  ...requireFinanceEdit,
  asyncHandler(financeController.closeCashFund.bind(financeController))
);
*/


/**
 * POST /api/finance/debts/remind
 * Send debt reminder notifications
 * Body: { customerIds: [1, 2, 3], message: 'optional' }
 */
router.post(
  '/debts/remind',
  ...requireFinanceEdit,
  asyncHandler(financeController.remindDebts.bind(financeController))
);

export default router;
