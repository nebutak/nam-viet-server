import { Router } from 'express';
import reportController from '@controllers/report.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  revenueReportSchema,
  inventoryReportSchema,
  dateRangeSchema,
  topProductsSchema,
  topCustomersSchema,
} from '@validators/report.validator';

const router = Router();

// All routes require authentication
router.use(authentication);

// =====================================================
// DASHBOARD
// =====================================================
// GET /api/reports/dashboard/stats - Complete dashboard stats (optimized)
router.get(
  '/dashboard/stats',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboardStats.bind(reportController))
);

// GET /api/reports/dashboard - Dashboard overview
router.get(
  '/dashboard',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboard.bind(reportController))
);

// GET /api/reports/dashboard/metrics - Dashboard metrics only
router.get(
  '/dashboard/metrics',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboardMetrics.bind(reportController))
);

// GET /api/reports/dashboard/revenue - Dashboard revenue with period filter
router.get(
  '/dashboard/revenue',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboardRevenue.bind(reportController))
);

// GET /api/reports/dashboard/sales-channels - Revenue by sales channel
router.get(
  '/dashboard/sales-channels',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboardSalesChannels.bind(reportController))
);

// GET /api/reports/dashboard/inventory-by-type - Inventory grouped by type
router.get(
  '/dashboard/inventory-by-type',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboardInventoryByType.bind(reportController))
);

// GET /api/reports/dashboard/recent-orders - Recent orders
router.get(
  '/dashboard/recent-orders',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboardRecentOrders.bind(reportController))
);

// GET /api/reports/dashboard/top-products - Top selling products
router.get(
  '/dashboard/top-products',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboardTopProducts.bind(reportController))
);

// GET /api/reports/dashboard/overdue-debts - Overdue debts
router.get(
  '/dashboard/overdue-debts',
  authorize('GET_DASHBOARD'),
  asyncHandler(reportController.getDashboardOverdueDebts.bind(reportController))
);

// =====================================================
// REVENUE REPORTS
// =====================================================
// GET /api/reports/revenue - Revenue report with grouping
router.get(
  '/revenue',
  authorize('GET_REVENUE_REPORT'),
  validate(revenueReportSchema, 'query'),
  asyncHandler(reportController.getRevenueReport.bind(reportController))
);

// GET /api/reports/revenue/export - Export revenue report to Excel
router.get(
  '/revenue/export',
  authorize('GET_REVENUE_REPORT'),
  validate(revenueReportSchema, 'query'),
  asyncHandler(reportController.exportRevenueReport.bind(reportController))
);

// GET /api/reports/revenue/by-channel - Revenue by sales channel
router.get(
  '/revenue/by-channel',
  authorize('GET_REVENUE_REPORT'),
  validate(dateRangeSchema, 'query'),
  asyncHandler(reportController.getRevenueByChannel.bind(reportController))
);

// GET /api/reports/revenue/by-region - Revenue by region
router.get(
  '/revenue/by-region',
  authorize('GET_REVENUE_REPORT'),
  validate(dateRangeSchema, 'query'),
  asyncHandler(reportController.getRevenueByRegion.bind(reportController))
);

// =====================================================
// INVENTORY REPORTS
// =====================================================
// GET /api/reports/inventory - Inventory report
router.get(
  '/inventory',
  authorize('GET_INVENTORY_REPORT'),
  validate(inventoryReportSchema, 'query'),
  asyncHandler(reportController.getInventoryReport.bind(reportController))
);

// GET /api/reports/inventory/export - Export inventory report to Excel
router.get(
  '/inventory/export',
  authorize('GET_INVENTORY_REPORT'),
  asyncHandler(reportController.exportInventoryReport.bind(reportController))
);

// GET /api/reports/inventory/by-type - Inventory by product type
router.get(
  '/inventory/by-type',
  authorize('GET_INVENTORY_REPORT'),
  asyncHandler(reportController.getInventoryByType.bind(reportController))
);

// GET /api/reports/inventory/turnover - Inventory turnover rate
router.get(
  '/inventory/turnover',
  authorize('GET_INVENTORY_REPORT'),
  validate(dateRangeSchema, 'query'),
  asyncHandler(reportController.getInventoryTurnover.bind(reportController))
);

// GET /api/reports/inventory/stock-flow - Stock flow report (Nhập-Xuất-Tồn)
router.get(
  '/inventory/stock-flow',
  authorize('GET_INVENTORY_REPORT'),
  asyncHandler(reportController.getInventoryStockFlow.bind(reportController))
);

// GET /api/reports/inventory/nxt-report - Inventory summary report (Nhập-Xuất-Tồn)
router.get(
  '/inventory/nxt-report',
  authorize('GET_INVENTORY_REPORT'),
  asyncHandler(reportController.getInventoryNXTReport.bind(reportController))
);

// GET /api/reports/inventory/ledger - Inventory detailed ledger (Sổ chi tiết vật tư)
router.get(
  '/inventory/ledger',
  authorize('GET_INVENTORY_REPORT'),
  asyncHandler(reportController.getInventoryLedger.bind(reportController))
);

// =====================================================
// SALES REPORTS
// =====================================================
// GET /api/reports/sales - Complete sales report with filters
router.get(
  '/sales',
  authorize('GET_SALES_REPORT'),
  validate(revenueReportSchema, 'query'),
  asyncHandler(reportController.getSalesReport.bind(reportController))
);

// GET /api/reports/sales/summary - KPI Summary (4 cards)
router.get(
  '/sales/summary',
  authorize('GET_SALES_REPORT'),
  asyncHandler(reportController.getSalesSummary.bind(reportController))
);

// GET /api/reports/sales/charts - Charts data (timeline + byChannel)
router.get(
  '/sales/charts',
  authorize('GET_SALES_REPORT'),
  asyncHandler(reportController.getSalesCharts.bind(reportController))
);

// GET /api/reports/sales/top - Top analysis (products/staff/customers)
router.get(
  '/sales/top',
  authorize('GET_SALES_REPORT'),
  asyncHandler(reportController.getSalesTopAnalysis.bind(reportController))
);

// GET /api/reports/sales/filter-options - Search customer & get staff
router.get(
  '/sales/filter-options',
  authorize('GET_SALES_REPORT'),
  asyncHandler(reportController.getFilterOptions.bind(reportController))
);

// GET /api/reports/sales/top-products - Top selling products
router.get(
  '/sales/top-products',
  authorize('GET_SALES_REPORT'),
  validate(topProductsSchema, 'query'),
  asyncHandler(reportController.getTopSellingProducts.bind(reportController))
);

// GET /api/reports/sales/top-customers - Top customers
router.get(
  '/sales/top-customers',
  authorize('GET_SALES_REPORT'),
  validate(topCustomersSchema),
  asyncHandler(reportController.getTopCustomers.bind(reportController))
);

// =====================================================
// PRODUCTION REPORTS
// =====================================================
// GET /api/reports/production - Production report
router.get(
  '/production',
  authorize('GET_FINANCIAL_REPORT'),
  validate(dateRangeSchema),
  asyncHandler(reportController.getProductionReport.bind(reportController))
);

// GET /api/reports/production/wastage - Wastage report
router.get(
  '/production/wastage',
  authorize('GET_FINANCIAL_REPORT'),
  validate(dateRangeSchema),
  asyncHandler(reportController.getWastageReport.bind(reportController))
);

// =====================================================
// EMPLOYEE REPORTS
// =====================================================
// GET /api/reports/employee-performance - Employee performance
router.get(
  '/employee-performance',
  authorize('GET_FINANCIAL_REPORT'),
  validate(dateRangeSchema),
  asyncHandler(reportController.getEmployeePerformance.bind(reportController))
);

// =====================================================
// FINANCIAL REPORTS
// =====================================================
// GET /api/reports/financial - Financial report
router.get(
  '/financial',
  authorize('GET_FINANCIAL_REPORT'),
  asyncHandler(reportController.getFinancialReport.bind(reportController))
);

// GET /api/reports/financial/export - Export financial report to Excel
router.get(
  '/financial/export',
  authorize('GET_FINANCIAL_REPORT'),
  asyncHandler(reportController.exportFinancialReport.bind(reportController))
);

// GET /api/reports/financial/cash-book - Sổ quỹ chi tiết với running balance
router.get(
  '/financial/cash-book',
  authorize('GET_FINANCIAL_REPORT'),
  asyncHandler(reportController.getCashBookReport.bind(reportController))
);

// GET /api/reports/financial/export-cash-book - Xuất excel danh sách sổ quỹ chi tiết
router.get(
  '/financial/export-cash-book',
  authorize('GET_FINANCIAL_REPORT'),
  asyncHandler(reportController.exportCashBookExcel.bind(reportController))
);

// =====================================================
// FILTER OPTIONS
// =====================================================
// GET /api/reports/filter-options/warehouses - Get warehouses for filter
router.get(
  '/filter-options/warehouses',
  authorize('GET_INVENTORY_REPORT'),
  asyncHandler(reportController.getWarehousesForFilter.bind(reportController))
);

export default router;

