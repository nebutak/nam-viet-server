import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import financeService from '@services/finance.service';

class FinanceController {
  // 1. OVERVIEW / SUMMARY

  /**
   * GET /api/finance/summary
   * Get KPI summary cards
   */
  async getSummary(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'fromDate and toDate are required',
      });
    }

    const summary = await financeService.getFinanceSummary(fromDate as string, toDate as string);

    return res.status(200).json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. CHARTS

  /**
   * GET /api/finance/charts/cash-flow
   * Get cash flow chart data
   */
  async getCashFlowChart(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'fromDate and toDate are required',
      });
    }

    const data = await financeService.getCashFlowChart(fromDate as string, toDate as string);

    return res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * GET /api/finance/charts/expenses
   * Get expense structure chart data
   */
  async getExpenseChart(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'fromDate and toDate are required',
      });
    }

    const data = await financeService.getExpenseStructureChart(fromDate as string, toDate as string);

    return res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. REPORTS

  /**
   * GET /api/finance/reports/pnl
   * Get P&L (Profit & Loss) detailed report
   */
  async getPnlReport(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'fromDate and toDate are required',
      });
    }

    const data = await financeService.getPnlReport(fromDate as string, toDate as string);

    return res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * GET /api/finance/cash-book
   * Get cash book entries (receipt + payment transactions)
   */
  async getCashBook(req: AuthRequest, res: Response) {
    const { fromDate, toDate, page, limit } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'fromDate and toDate are required',
      });
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    const data = await financeService.getCashBook(fromDate as string, toDate as string, pageNum, limitNum);

    return res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * GET /api/finance/debts
   * Get debts (customer or supplier)
   */
  async getDebts(req: AuthRequest, res: Response) {
    const { type = 'customer', status = 'all' } = req.query;

    const data = await financeService.getDebts(type as 'customer' | 'supplier', status as 'all' | 'overdue');

    return res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /*
  async closeCashFund(req: AuthRequest, res: Response) {
    ... (removed)
  }
  */


  /**
   * POST /api/finance/debts/remind
   * Send debt reminders to customers
   */
  async remindDebts(req: AuthRequest, res: Response) {
    const { customerIds, message } = req.body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'customerIds array is required and must not be empty',
      });
    }

    const result = await financeService.remindDebts(customerIds, message);

    return res.status(200).json({
      success: result.success,
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  }
}

export default new FinanceController();
