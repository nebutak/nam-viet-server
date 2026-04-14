import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import reportService from '@services/report.service';
import financialService from '@services/financial.service';

class ReportController {
  // GET /api/reports/dashboard/stats - Complete dashboard stats (optimized all-in-one)
  async getDashboardStats(req: AuthRequest, res: Response) {
    const { period = 'month', fromDate, toDate, warehouseId } = req.query;
    const stats = await reportService.getDashboardStats({
      period: period as string,
      fromDate: fromDate as string,
      toDate: toDate as string,
      warehouseId: (warehouseId && warehouseId !== 'all') ? parseInt(warehouseId as string) : undefined,
    });

    res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/dashboard - Dashboard overview
  async getDashboard(_req: AuthRequest, res: Response) {
    const dashboard = await reportService.getDashboard();

    res.status(200).json({
      success: true,
      data: dashboard,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/dashboard/metrics - Dashboard metrics only
  async getDashboardMetrics(_req: AuthRequest, res: Response) {
    const metrics = await reportService.getDashboardMetrics();

    res.status(200).json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/dashboard/revenue?period=month - Dashboard revenue
  async getDashboardRevenue(req: AuthRequest, res: Response) {
    const { period = 'month', fromDate, toDate, warehouseId } = req.query;
    const revenue = await reportService.getDashboardRevenue({
      period: period as string,
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined,
      warehouseId: (warehouseId && warehouseId !== 'all') ? parseInt(warehouseId as string) : undefined,
    });

    res.status(200).json({
      success: true,
      data: revenue,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/dashboard/sales-channels - Revenue by sales channel
  async getDashboardSalesChannels(req: AuthRequest, res: Response) {
    const { fromDate, toDate, warehouseId } = req.query;
    const salesChannels = await reportService.getDashboardSalesChannels(
      fromDate as string,
      toDate as string,
      (warehouseId && warehouseId !== 'all') ? parseInt(warehouseId as string) : undefined
    );

    res.status(200).json({
      success: true,
      data: salesChannels,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/dashboard/inventory-by-type - Inventory grouped by type
  async getDashboardInventoryByType(req: AuthRequest, res: Response) {
    const { warehouseId } = req.query;
    const inventoryByType = await reportService.getDashboardInventoryByType(
      (warehouseId && warehouseId !== 'all') ? parseInt(warehouseId as string) : undefined
    );

    res.status(200).json({
      success: true,
      data: inventoryByType,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/dashboard/recent-orders?limit=10 - Recent orders
  async getDashboardRecentOrders(req: AuthRequest, res: Response) {
    const { limit = '10' } = req.query;
    const recentOrders = await reportService.getDashboardRecentOrders(parseInt(limit as string));

    res.status(200).json({
      success: true,
      data: recentOrders,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/dashboard/top-products?limit=10 - Top selling products
  async getDashboardTopProducts(req: AuthRequest, res: Response) {
    const { limit = '10' } = req.query;
    const topProducts = await reportService.getDashboardTopProducts(parseInt(limit as string));

    res.status(200).json({
      success: true,
      data: topProducts,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/dashboard/overdue-debts - Overdue debts
  async getDashboardOverdueDebts(_req: AuthRequest, res: Response) {
    const overdueDebts = await reportService.getDashboardOverdueDebts();

    res.status(200).json({
      success: true,
      data: overdueDebts,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/revenue - Revenue report
  async getRevenueReport(req: AuthRequest, res: Response) {
    const result = await reportService.getRevenueReport(req.query as any);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/revenue/export - Export revenue report to Excel
  async exportRevenueReport(req: AuthRequest, res: Response) {
    const params = {
      ...req.query,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    };

    const result = await reportService.exportRevenueReport(params as any);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=BaoCaoDoanhThu_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(result);
  }

  // GET /api/reports/revenue/by-channel - Revenue by sales channel
  async getRevenueByChannel(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const result = await reportService.getRevenueByChannel(fromDate as string, toDate as string);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/revenue/by-region - Revenue by region
  async getRevenueByRegion(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const result = await reportService.getRevenueByRegion(fromDate as string, toDate as string);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/inventory - Inventory report
  async getInventoryReport(req: AuthRequest, res: Response) {
    // Convert query params
    const params = {
      ...req.query,
      warehouseId: req.query.warehouseId ? Number(req.query.warehouseId) : undefined,
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
      lowStock: req.query.lowStock === 'true',
      showExpiring: req.query.showExpiring === 'true',
    };

    const result = await reportService.getInventoryReport(params as any);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/inventory/by-type - Inventory by product type
  async getInventoryByType(_req: AuthRequest, res: Response) {
    const result = await reportService.getInventoryByType();

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/inventory/turnover - Inventory turnover rate
  async getInventoryTurnover(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const result = await reportService.getInventoryTurnover(fromDate as string, toDate as string);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/inventory/stock-flow - Stock flow report
  async getInventoryStockFlow(req: AuthRequest, res: Response) {
    const result = await reportService.getInventoryStockFlow(req.query as any);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/inventory/nxt-report - Inventory summary report
  async getInventoryNXTReport(req: AuthRequest, res: Response) {
    const result = await reportService.getInventoryNXTReport(req.query as any);

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/inventory/ledger - Inventory detailed ledger
  async getInventoryLedger(req: AuthRequest, res: Response) {
    const { productId, fromDate, toDate, warehouseId } = req.query;
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        error: { message: 'productId is required' }
      });
    }

    const result = await reportService.getInventoryLedger({
      productId: parseInt(productId as string),
      fromDate: fromDate as string,
      toDate: toDate as string,
      warehouseId: warehouseId ? parseInt(warehouseId as string) : undefined
    });

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/sales/top-products - Top selling products
  async getTopSellingProducts(req: AuthRequest, res: Response) {
    const { limit, fromDate, toDate } = req.query;
    const result = await reportService.getTopSellingProducts(
      limit ? parseInt(limit as string) : 10,
      fromDate as string,
      toDate as string
    );

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/sales - Complete sales report
  async getSalesReport(req: AuthRequest, res: Response) {
    const { fromDate, toDate, warehouseId, salesChannel, customerId, createdBy, orderStatus } = req.query;
    const result = await reportService.getSalesReport({
      fromDate: fromDate as string,
      toDate: toDate as string,
      warehouseId: warehouseId ? parseInt(warehouseId as string) : undefined,
      salesChannel: salesChannel as any,
      customerId: customerId ? parseInt(customerId as string) : undefined,
      createdBy: createdBy ? parseInt(createdBy as string) : undefined,
      orderStatus: orderStatus as any,
    });

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/sales/summary - KPI Summary
  async getSalesSummary(req: AuthRequest, res: Response) {
    const { fromDate, toDate, warehouseId, salesChannel, customerId, createdBy } = req.query;
    const result = await reportService.getSalesSummary({
      fromDate: fromDate as string,
      toDate: toDate as string,
      warehouseId: warehouseId ? parseInt(warehouseId as string) : undefined,
      salesChannel: salesChannel as any,
      customerId: customerId ? parseInt(customerId as string) : undefined,
      createdBy: createdBy ? parseInt(createdBy as string) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/sales/charts - Charts data
  async getSalesCharts(req: AuthRequest, res: Response) {
    const { fromDate, toDate, warehouseId, salesChannel, customerId, createdBy } = req.query;
    const result = await reportService.getSalesCharts({
      fromDate: fromDate as string,
      toDate: toDate as string,
      warehouseId: warehouseId ? parseInt(warehouseId as string) : undefined,
      salesChannel: salesChannel as any,
      customerId: customerId ? parseInt(customerId as string) : undefined,
      createdBy: createdBy ? parseInt(createdBy as string) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/sales/top - Top analysis
  async getSalesTopAnalysis(req: AuthRequest, res: Response) {
    const { fromDate, toDate, warehouseId, salesChannel, customerId, createdBy, type } = req.query;
    const result = await reportService.getSalesTopAnalysis({
      fromDate: fromDate as string,
      toDate: toDate as string,
      warehouseId: warehouseId ? parseInt(warehouseId as string) : undefined,
      salesChannel: salesChannel as any,
      customerId: customerId ? parseInt(customerId as string) : undefined,
      createdBy: createdBy ? parseInt(createdBy as string) : undefined,
      type: (type as any) || 'product',
    });

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/sales/filter-options - Filter options
  async getFilterOptions(req: AuthRequest, res: Response) {
    const { action, keyword } = req.query;
    const result = await reportService.getFilterOptions(
      (action as any) || 'get-sales-staff',
      keyword as string
    );

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/sales/top-customers - Top customers
  async getTopCustomers(req: AuthRequest, res: Response) {
    const { limit, fromDate, toDate } = req.query;
    const result = await reportService.getTopCustomers(
      limit ? parseInt(limit as string) : 10,
      fromDate as string,
      toDate as string
    );

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/production - Production report
  async getProductionReport(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const result = await reportService.getProductionReport(fromDate as string, toDate as string);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/production/wastage - Wastage report
  async getWastageReport(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const result = await reportService.getWastageReport(fromDate as string, toDate as string);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/employee-performance - Employee performance
  async getEmployeePerformance(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const result = await reportService.getEmployeePerformance(fromDate as string, toDate as string);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/financial - Financial report
  async getFinancialReport(req: AuthRequest, res: Response) {
    const { fromDate, toDate, datePreset } = req.query;
    
    // Calculate date range based on preset or custom dates
    const today = new Date();
    let start = fromDate as string;
    let end = toDate as string;

    if (datePreset && !fromDate) {
      const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
      const subDays = (date: Date, days: number) => new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
      
      switch (datePreset) {
        case 'today':
          start = today.toISOString().split('T')[0];
          end = today.toISOString().split('T')[0];
          break;
        case 'yesterday':
          const yesterday = subDays(today, 1);
          start = yesterday.toISOString().split('T')[0];
          end = yesterday.toISOString().split('T')[0];
          break;
        case 'thisWeek':
          const weekStart = subDays(today, today.getDay());
          start = weekStart.toISOString().split('T')[0];
          end = today.toISOString().split('T')[0];
          break;
        case 'thisMonth':
          start = startOfMonth(today).toISOString().split('T')[0];
          end = today.toISOString().split('T')[0];
          break;
        case 'lastMonth':
          const lastMonth = subDays(today, today.getDate());
          start = startOfMonth(lastMonth).toISOString().split('T')[0];
          end = lastMonth.toISOString().split('T')[0];
          break;
        case 'thisYear':
          start = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
          end = today.toISOString().split('T')[0];
          break;
      }
    }

    const result = await financialService.getFinancialReport(start, end);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/financial/export - Export financial report to Excel
  async exportFinancialReport(req: AuthRequest, res: Response) {
    try {
      const { fromDate, toDate, datePreset } = req.query;
      const today = new Date();
      const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
      const subDays = (date: Date, days: number) => new Date(date.getTime() - days * 24 * 60 * 60 * 1000);

      let start = typeof fromDate === 'string' ? fromDate : '';
      let end = typeof toDate === 'string' ? toDate : '';

      if (datePreset && !start) {
        switch (datePreset) {
          case 'today':
            start = today.toISOString().split('T')[0];
            end = today.toISOString().split('T')[0];
            break;
          case 'yesterday': {
            const yesterday = subDays(today, 1);
            start = yesterday.toISOString().split('T')[0];
            end = yesterday.toISOString().split('T')[0];
            break;
          }
          case 'thisWeek': {
            const weekStart = subDays(today, today.getDay());
            start = weekStart.toISOString().split('T')[0];
            end = today.toISOString().split('T')[0];
            break;
          }
          case 'thisMonth':
            start = startOfMonth(today).toISOString().split('T')[0];
            end = today.toISOString().split('T')[0];
            break;
          case 'lastMonth': {
            const lastMonth = subDays(today, today.getDate());
            start = startOfMonth(lastMonth).toISOString().split('T')[0];
            end = lastMonth.toISOString().split('T')[0];
            break;
          }
          case 'thisYear':
            start = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
            end = today.toISOString().split('T')[0];
            break;
          default:
            start = startOfMonth(today).toISOString().split('T')[0];
            end = today.toISOString().split('T')[0];
        }
      }

      // Default to current month if dates still missing
      if (!start || !end) {
        start = start || startOfMonth(today).toISOString().split('T')[0];
        end = end || today.toISOString().split('T')[0];
      }

      const result = await financialService.exportFinancialReport(start, end);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=BaoCaoTaiChinh_${start}_${end}.xlsx`);
      res.send(result);
    } catch (err: any) {
      console.error('Export financial report error:', err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Không thể xuất file Excel. Vui lòng thử lại.',
      });
    }
  }

  /**
   * Export cash book to excel
   */
  async exportCashBookExcel(req: AuthRequest, res: Response): Promise<void> {
    const fromDate = req.query.fromDate as string;
    const toDate = req.query.toDate as string;

    if (!fromDate || !toDate) {
      res.status(400).json({ success: false, message: 'Thiếu thời gian báo cáo' });
      return;
    }

    try {
      const params = {
        fromDate,
        toDate,
        customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
        supplierId: req.query.supplierId ? Number(req.query.supplierId) : undefined,
        createdById: req.query.createdById ? Number(req.query.createdById) : undefined,
        receiverName: req.query.receiverName as string,
        receiverTypes: req.query.receiverTypes ? (req.query.receiverTypes as string).split(',') : undefined,
        voucherType: req.query.voucherType as string,
        page: 1,
        pageSize: 999999,
      };

      const buffer = await financialService.exportCashBookExcel(params);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=SoQuy_${fromDate}_${toDate}.xlsx`);
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi xuất sổ quỹ',
      });
    }
  }

  // GET /api/reports/filter-options/warehouses - Get warehouses for filter
  async getWarehousesForFilter(_req: AuthRequest, res: Response) {
    const warehouses = await reportService.getWarehousesForFilter();

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách kho thành công',
      data: warehouses,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/reports/inventory/export - Export inventory report to Excel
  async exportInventoryReport(req: AuthRequest, res: Response) {
    const params = {
      ...req.query,
      warehouseId: req.query.warehouseId ? Number(req.query.warehouseId) : undefined,
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
      lowStock: req.query.lowStock === 'true',
      showExpiring: req.query.showExpiring === 'true',
    };

    const result = await reportService.exportInventoryReport(params as any);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=BaoCaoTonKho_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(result);
  }

  // GET /api/reports/financial/cash-book - Sổ quỹ chi tiết
  async getCashBookReport(req: AuthRequest, res: Response) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    const {
      fromDate = firstDay.toISOString().split('T')[0],
      toDate = today.toISOString().split('T')[0],
      customerId,
      supplierId,
      createdById,
      receiverName,
      receiverTypes,
      voucherType,
      page = '1',
      pageSize = '20',
    } = req.query as Record<string, string>;

    const result = await financialService.getCashBookReport({
      fromDate: fromDate as string,
      toDate: toDate as string,
      customerId: customerId ? Number(customerId) : undefined,
      supplierId: supplierId ? Number(supplierId) : undefined,
      createdById: createdById ? Number(createdById) : undefined,
      receiverName: receiverName as string | undefined,
      receiverTypes: receiverTypes ? (receiverTypes as string).split(',') : undefined,
      voucherType: voucherType as string | undefined,
      page: Number(page),
      pageSize: Number(pageSize),
    });

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }
}

export default new ReportController();

