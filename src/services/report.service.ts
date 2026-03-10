import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface DateRange {
  fromDate: Date;
  toDate: Date;
}

interface RevenueParams {
  fromDate?: string;
  toDate?: string;
  groupBy?: 'day' | 'week' | 'month' | 'year';
  salesChannel?: string;
  customerId?: number;
}

interface InventoryReportParams {
  warehouseId?: number;
  categoryId?: number;
  productType?: string;
  lowStock?: boolean;
  searchTerm?: string;
  showExpiring?: boolean;
}

class ReportService {
  // =====================================================
  // DASHBOARD COMPLETE STATS (Optimized All-in-One)
  // =====================================================
  async getDashboardStats(options: { period?: string; fromDate?: string; toDate?: string; warehouseId?: number }) {
    const { period = 'month', fromDate, toDate, warehouseId } = options;
    
    const today = new Date();
    let periodFromDate: Date, periodToDate: Date;
    let previousFromDate: Date, previousToDate: Date;

    // Determine period dates: Use custom if provided, otherwise switch on period
    if (fromDate && toDate) {
      periodFromDate = new Date(fromDate);
      periodToDate = new Date(toDate);
      // Calculate previous period same length as current
      const duration = periodToDate.getTime() - periodFromDate.getTime();
      previousToDate = new Date(periodFromDate.getTime()); // Prev end is current start (approx, or -1ms)
      previousFromDate = new Date(previousToDate.getTime() - duration);
    } else {
      // Calculate period dates
      switch (period) {
        case 'week':
          periodFromDate = new Date(today);
          periodFromDate.setDate(today.getDate() - today.getDay());
          periodFromDate.setHours(0, 0, 0, 0);
          periodToDate = new Date(today.setHours(23, 59, 59, 999));

          previousFromDate = new Date(periodFromDate);
          previousFromDate.setDate(previousFromDate.getDate() - 7);
          previousToDate = new Date(periodFromDate);
          previousToDate.setHours(23, 59, 59, 999);
          previousToDate.setDate(previousToDate.getDate() - 1);
          break;

        case 'day':
          periodFromDate = new Date(today.setHours(0, 0, 0, 0));
          periodToDate = new Date(today.setHours(23, 59, 59, 999));

          previousFromDate = new Date(periodFromDate);
          previousFromDate.setDate(previousFromDate.getDate() - 1);
          previousToDate = new Date(previousFromDate);
          previousToDate.setHours(23, 59, 59, 999);
          break;

        case 'month':
        default:
          periodFromDate = new Date(today.getFullYear(), today.getMonth(), 1);
          periodToDate = new Date(today.setHours(23, 59, 59, 999));

          previousFromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          previousToDate = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
          break;
      }
    }

    // Common WHERE clauses for quick inline usage
    const invoiceWhere: any = { orderStatus: 'pending' };
    if (warehouseId) invoiceWhere.warehouseId = warehouseId;
    
    // Note: Production Order and Activity Logs might not support warehouse param easily
    // We will apply warehouse filter where straightforward

    // Fetch all data in parallel
    const [
      // KPI metrics
      revenueThisPeriod,
      revenuePreviousPeriod,
      ordersThisPeriod,
      ordersPending,
      totalInventoryValue,
      lowStockCount,
      totalReceivables, // Note: Debt usually not filtered by warehouse
      overdueDebtCount, // Note: Debt usually not filtered by warehouse
      activeProduction,

      // Charts data
      revenueTrendData,
      salesChannelsData,
      inventoryByTypeData,

      // Alerts - Low stock items
      lowStockItems,
      overdueDebts,

      // Recent data
      recentOrders,
      topProducts,
      activityLogs,
    ] = await Promise.all([
      // KPI
      this.getRevenueByPeriod(periodFromDate, periodToDate, warehouseId),
      this.getRevenueByPeriod(previousFromDate, previousToDate, warehouseId),
      this.getOrderCountByPeriod(periodFromDate, periodToDate, warehouseId),
      prisma.invoice.count({ where: invoiceWhere }),
      this.getTotalInventoryValue(warehouseId),
      this.getLowStockCount(warehouseId),
      this.getTotalReceivables(), // Global debt
      this.getOverdueDebtCount(), // Global debt
      0, // Production module removed

      // Charts
      this.getDashboardRevenue({
        period,
        fromDate: periodFromDate,
        toDate: periodToDate,
        warehouseId,
      }),
      this.getDashboardSalesChannels(periodFromDate.toISOString(), periodToDate.toISOString(), warehouseId),
      this.getDashboardInventoryByType(warehouseId),

      // Alerts: Get low stock items
      prisma.inventory.findMany({
        where: {
          ...(warehouseId && { warehouseId }),
          product: {
            minStockLevel: { gt: 0 },
            status: 'active',
          },
          quantity: {
            lt: 100, // Simplified trigger
          },
        },
        take: 3,
        include: {
          product: {
            select: { id: true, productName: true, code: true, minStockLevel: true },
          },
          warehouse: { select: { id: true, warehouseName: true } },
        },
      }),
      prisma.customer.findMany({
        where: {
          currentDebt: { gt: 0 },
          debtUpdatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          customerCode: true,
          customerName: true,
          currentDebt: true,
          debtUpdatedAt: true,
          phone: true,
        },
        take: 3,
        orderBy: { currentDebt: 'desc' },
      }),

      // Recent
      prisma.invoice.findMany({
        where: warehouseId ? { warehouseId } : undefined,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderCode: true,
          orderDate: true,
          totalAmount: true,
          orderStatus: true,
          paymentStatus: true,
          customer: { select: { id: true, customerName: true } },
        },
      }),
      this.getDashboardTopProducts(5, periodFromDate.toISOString(), periodToDate.toISOString()), // Missing warehouse
      prisma.activityLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          userId: true,
          user: { select: { fullName: true } },
          action: true,
          tableName: true,
          recordId: true,
        },
      }),
    ]);

    // Calculate trend percentage
    const revenueGrowth =
      revenuePreviousPeriod > 0
        ? ((revenueThisPeriod - revenuePreviousPeriod) / revenuePreviousPeriod) * 100
        : 0;

    // Format low stock items
    const formattedLowStockItems = lowStockItems.map((inv: any) => ({
      product_id: inv.product.id,
      product_name: inv.product.productName,
      sku: inv.product.code,
      current_stock: Number(inv.quantity),
      min_stock: Number(inv.product.minStockLevel),
      warehouse_id: inv.warehouse.id,
      warehouse_name: inv.warehouse.warehouseName,
    }));

    // Format overdue debts
    const formattedOverdueDebts = overdueDebts.map((debt: any) => {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(debt.debtUpdatedAt || new Date()).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return {
        customer_id: debt.id,
        customer_name: debt.customerName,
        customer_code: debt.customerCode,
        total_debt: Number(debt.currentDebt),
        days_overdue: daysOverdue,
        phone: debt.phone,
      };
    });

    // Format activity logs
    const formattedActivityLogs = activityLogs.map((log: any) => {
      // Map action to activity type
      let activityType: 'order' | 'inventory' | 'production' | 'finance' | 'user' = 'user';

      if (log.tableName) {
        if (['invoices', 'deliveries'].includes(log.tableName)) {
          activityType = 'order';
        } else if (['inventory', 'stock_transactions'].includes(log.tableName)) {
          activityType = 'inventory';
        } else if (['cash_funds', 'payment_vouchers', 'payment_receipts'].includes(log.tableName)) {
          activityType = 'finance';
        }
      }

      return {
        id: log.id,
        timestamp: log.createdAt,
        user_name: log.user?.fullName || 'Unknown',
        action: log.action,
        description: `${log.action} ${log.tableName}`,
        type: activityType,
      };
    });

    const result = {
      period,
      kpi: {
        revenue: {
          current: revenueThisPeriod,
          previous: revenuePreviousPeriod,
          growth_percent: Math.round(revenueGrowth * 100) / 100,
        },
        orders: {
          current: ordersThisPeriod,
          pending: ordersPending,
        },
        inventory: {
          total_value: totalInventoryValue,
          low_stock_count: lowStockCount,
        },
        debt: {
          receivables: totalReceivables,
          overdue_count: overdueDebtCount,
        },
        production: {
          active: activeProduction,
        },
      },
      charts: {
        revenue_trend: revenueTrendData.data,
        sales_channels: salesChannelsData,
        inventory_share: inventoryByTypeData,
      },
      alerts: {
        low_stock: formattedLowStockItems,
        overdue_debts: formattedOverdueDebts,
      },
      recent: {
        orders: recentOrders.map((order: any) => ({
          ...order,
          id: order.id.toString(), // Convert BigInt to string if needed
        })),
        products: topProducts,
        activities: formattedActivityLogs.map((log: any) => ({
          ...log,
          id: log.id.toString(), // Convert BigInt to string
        })),
      },
      timestamp: new Date().toISOString(),
    };

    return result;
  }

  // =====================================================
  // DASHBOARD METRICS
  // =====================================================
  async getDashboard() {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    // This week
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // This month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // This year
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Last period for comparison
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

    const [
      // Revenue metrics
      revenueToday,
      revenueThisWeek,
      revenueThisMonth,
      revenueThisYear,
      revenueLastMonth,

      // Order metrics
      ordersToday,
      ordersThisWeek,
      ordersThisMonth,
      ordersPending,
      ordersPreparing,
      ordersDelivering,

      // Inventory metrics
      totalInventoryValue,
      lowStockCount,
      expiringProductsCount,

      // Debt metrics
      totalReceivables,
      overdueDebtCount,

      // Production metrics
      productionOrdersInProgress,
    ] = await Promise.all([
      // Revenue
      this.getRevenueByPeriod(startOfToday, endOfToday),
      this.getRevenueByPeriod(startOfWeek, endOfToday),
      this.getRevenueByPeriod(startOfMonth, endOfToday),
      this.getRevenueByPeriod(startOfYear, endOfToday),
      this.getRevenueByPeriod(lastMonthStart, lastMonthEnd),

      // Orders
      this.getOrderCountByPeriod(startOfToday, endOfToday),
      this.getOrderCountByPeriod(startOfWeek, endOfToday),
      this.getOrderCountByPeriod(startOfMonth, endOfToday),
      prisma.invoice.count({ where: { orderStatus: 'pending' } }),
      prisma.invoice.count({ where: { orderStatus: 'preparing' } }),
      prisma.invoice.count({ where: { orderStatus: 'delivering' } }),

      // Inventory
      this.getTotalInventoryValue(),
      this.getLowStockCount(),
      this.getExpiringProductsCount(7),

      // Debt
      this.getTotalReceivables(),
      this.getOverdueDebtCount(),

      // Production
      0, // Production module removed
    ]);

    const dashboard = {
      revenue: {
        today: revenueToday,
        thisWeek: revenueThisWeek,
        thisMonth: revenueThisMonth,
        thisYear: revenueThisYear,
        lastMonth: revenueLastMonth,
        monthOverMonthGrowth:
          revenueLastMonth > 0
            ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
            : 0,
      },
      orders: {
        today: ordersToday,
        thisWeek: ordersThisWeek,
        thisMonth: ordersThisMonth,
        pending: ordersPending,
        preparing: ordersPreparing,
        delivering: ordersDelivering,
      },
      inventory: {
        totalValue: totalInventoryValue,
        lowStock: lowStockCount,
        expiringSoon: expiringProductsCount,
      },
      debt: {
        totalReceivables: totalReceivables,
        overdueCount: overdueDebtCount,
      },
      production: {
        inProgress: productionOrdersInProgress,
      },
    };

    return dashboard;
  }

  // GET /api/reports/dashboard/metrics - Dashboard metrics only
  async getDashboardMetrics() {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

    const [
      revenueToday,
      revenueThisMonth,
      revenueLastMonth,
      ordersToday,
      ordersThisMonth,
      totalInventoryValue,
      lowStockCount,
      totalReceivables,
    ] = await Promise.all([
      this.getRevenueByPeriod(startOfToday, endOfToday),
      this.getRevenueByPeriod(startOfMonth, endOfToday),
      this.getRevenueByPeriod(lastMonthStart, lastMonthEnd),
      this.getOrderCountByPeriod(startOfToday, endOfToday),
      this.getOrderCountByPeriod(startOfMonth, endOfToday),
      this.getTotalInventoryValue(),
      this.getLowStockCount(),
      this.getTotalReceivables(),
    ]);

    const metrics = {
      revenue: {
        today: revenueToday,
        thisMonth: revenueThisMonth,
        lastMonth: revenueLastMonth,
        growth:
          revenueLastMonth > 0
            ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
            : 0,
      },
      orders: {
        today: ordersToday,
        thisMonth: ordersThisMonth,
      },
      inventory: {
        totalValue: totalInventoryValue,
        lowStock: lowStockCount,
      },
      debt: {
        totalReceivables,
      },
    };

    return metrics;
  }

  // GET /api/reports/dashboard/revenue?period=month
  async getDashboardRevenue(options: { period?: string; fromDate?: Date; toDate?: Date; warehouseId?: number }) {
    const { period = 'month', fromDate: customFromDate, toDate: customToDate, warehouseId } = options;
    const today = new Date();
    let fromDate: Date;
    let toDate = customToDate || new Date();

    if (customFromDate && customToDate) {
      fromDate = customFromDate;
    } else {
      switch (period) {
        case 'today':
          fromDate = new Date(today.setHours(0, 0, 0, 0));
          toDate = new Date(today.setHours(23, 59, 59, 999));
          break;
        case 'week':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - today.getDay());
          fromDate.setHours(0, 0, 0, 0);
          break;
        case 'year':
          fromDate = new Date(today.getFullYear(), 0, 1);
          break;
        case 'month':
        default:
          fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
          break;
      }
    }

    const where: any = {
      orderStatus: 'completed',
      completedAt: {
        gte: fromDate,
        lte: toDate,
      },
    };

    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const orders = await prisma.invoice.findMany({
      where,
      select: {
        completedAt: true,
        totalAmount: true,
      },
      orderBy: { completedAt: 'asc' },
    });

    // Group by day for charting
    const grouped = orders.reduce((acc, order) => {
      const date = new Date(order.completedAt!);
      const key = date.toISOString().split('T')[0];

      if (!acc[key]) {
        acc[key] = {
          date: key,
          revenue: 0,
        };
      }

      acc[key].revenue += Number(order.totalAmount);
      return acc;
    }, {} as Record<string, { date: string; revenue: number }>);

    const result = {
      period,
      data: Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)),
      total_revenue: orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      total_orders: orders.length,
    };

    return result;
  }

  // GET /api/reports/dashboard/sales-channels
  // GET /api/reports/dashboard/sales-channels
  async getDashboardSalesChannels(fromDate?: string, toDate?: string, warehouseId?: number) {
    const start = fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = toDate ? new Date(toDate) : new Date();

    const result = await this.getRevenueByChannel(
      start.toISOString(),
      end.toISOString(),
      warehouseId
    );

    return result;
  }

  // GET /api/reports/dashboard/inventory-by-type
  // GET /api/reports/dashboard/inventory-by-type
  async getDashboardInventoryByType(warehouseId?: number) {
    const result = await this.getInventoryByType(warehouseId);

    return result;
  }

  // GET /api/reports/dashboard/recent-orders?limit=10
  async getDashboardRecentOrders(limit: number = 10) {
    const orders = await prisma.invoice.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderCode: true,
        orderDate: true,
        totalAmount: true,
        orderStatus: true,
        paymentStatus: true,
        customer: {
          select: {
            id: true,
            customerName: true,
            customerCode: true,
          },
        },
      },
    });

    return orders;
  }

  // GET /api/reports/dashboard/top-products?limit=10
  async getDashboardTopProducts(limit: number = 10, fromDate?: string, toDate?: string) {
    const start = fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = toDate ? new Date(toDate) : new Date();

    const result = await this.getTopSellingProducts(
      limit,
      start.toISOString(),
      end.toISOString()
    );

    return result;
  }

  // GET /api/reports/dashboard/overdue-debts
  async getDashboardOverdueDebts() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const overdueDebts = await prisma.customer.findMany({
      where: {
        currentDebt: {
          gt: 0,
        },
        debtUpdatedAt: {
          lt: thirtyDaysAgo,
        },
      },
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        currentDebt: true,
        debtUpdatedAt: true,
        phone: true,
      },
      orderBy: { currentDebt: 'desc' },
      take: 10,
    });

    const result = overdueDebts.map((customer) => {
      const now = new Date();
      const debtDate = customer.debtUpdatedAt ? new Date(customer.debtUpdatedAt) : new Date();
      const daysOverdue = Math.floor((now.getTime() - debtDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        customer_id: customer.id,
        customer_name: customer.customerName,
        customer_code: customer.customerCode,
        total_debt: Number(customer.currentDebt),
        overdue_amount: Number(customer.currentDebt),
        days_overdue: daysOverdue,
        phone: customer.phone,
      };
    });

    return result;
  }

  // =====================================================
  // REVENUE ANALYTICS
  // =====================================================
  async getRevenueReport(params: RevenueParams) {
    const { fromDate, toDate, groupBy = 'day', salesChannel, customerId } = params;

    const dateRange = this.getDateRange(fromDate, toDate);

    const where: Prisma.InvoiceWhereInput = {
      orderStatus: 'completed',
      completedAt: {
        gte: dateRange.fromDate,
        lte: dateRange.toDate,
      },
      ...(salesChannel && { salesChannel: salesChannel as any }),
      ...(customerId && { customerId }),
    };

    const orders = await prisma.invoice.findMany({
      where,
      select: {
        id: true,
        orderCode: true,
        orderDate: true,
        completedAt: true,
        totalAmount: true,
        discountAmount: true,
        taxAmount: true,
        shippingFee: true,
        paidAmount: true,
        salesChannel: true,
        customer: {
          select: {
            id: true,
            customerName: true,
            classification: true,
          },
        },
      },
      orderBy: { completedAt: 'asc' },
    });

    // Group by period
    const grouped = this.groupByPeriod(orders, groupBy, 'completedAt');

    // Calculate totals from raw orders
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const totalDiscount = orders.reduce((sum, o) => sum + Number(o.discountAmount || 0), 0);
    const totalTax = orders.reduce((sum, o) => sum + Number(o.taxAmount || 0), 0);
    const totalShipping = orders.reduce((sum, o) => sum + Number(o.shippingFee || 0), 0);
    const totalPaid = orders.reduce((sum, o) => sum + Number(o.paidAmount || 0), 0);
    const orderCount = orders.length;
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    // Map to frontend expected summary fields
    const summary = {
      grossRevenue: totalRevenue,
      netRevenue: totalRevenue - totalDiscount,
      totalOrders: orderCount,
      totalDiscount: totalDiscount,
      totalTax: totalTax,
      averageOrderValue: averageOrderValue,
      paidAmount: totalPaid,
      debtAmount: totalRevenue - totalPaid,  // ✅ FIX: Calculate actual debt
      shippingFee: totalShipping,
      growth: 0,  // TODO: Compare with previous period
    };

    // Prepare trend data expected by frontend
    const trendData = grouped.map((g: any) => ({
      date: g.period,
      revenue: g.revenue,
      orders: g.orderCount,
    }));

    // Additional sections expected by frontend
    const byChannel = await this.getRevenueByChannel(fromDate, toDate);
    const topProducts = await this.getTopSellingProducts(10, fromDate, toDate);
    const ordersDetail = orders.map((o) => ({
      id: o.id,
      orderCode: o.orderCode,
      orderDate: o.orderDate,
      completedAt: o.completedAt,
      customerName: o.customer?.customerName || 'Unknown',
      staffName: null,
      totalAmount: Number(o.totalAmount),
      discountAmount: Number(o.discountAmount || 0),
      taxAmount: Number(o.taxAmount || 0),
      shippingFee: Number(o.shippingFee || 0),
      finalAmount: Number(o.totalAmount) - Number(o.discountAmount || 0) + Number(o.taxAmount || 0) + Number(o.shippingFee || 0),
      paidAmount: Number(o.paidAmount || 0),
      debtAmount: Math.max(0, Number(o.totalAmount) - Number(o.paidAmount || 0)),
      paymentStatus: Number(o.paidAmount || 0) >= Number(o.totalAmount) ? 'paid' : Number(o.paidAmount || 0) > 0 ? 'partial' : 'unpaid',
      paymentMethod: null,
      orderStatus: 'completed',
      deliveryAddress: null,
    }));

    // Product performance: reuse topProducts mapping
    const totalProductRevenue = topProducts.reduce((sum, p: any) => sum + (p.revenue || 0), 0);
    const productPerformance = topProducts.map((p: any, idx: number) => ({
      productId: p.productId || idx,
      sku: p.sku || '',
      productName: p.productName || 'Unknown',
      unit: p.unit || 'pcs',
      quantity: p.quantitySold || 0,
      revenue: p.revenue || 0,
      percentage: totalProductRevenue > 0 ? ((p.revenue || 0) / totalProductRevenue) * 100 : 0,
    }));

    // Customer analysis
    const customerAnalysis = await this.getTopCustomers(10, fromDate, toDate);

    return {
      summary,
      trendData,
      byChannel,
      topProducts: topProducts as any,
      orders: ordersDetail,
      productPerformance,
      customerAnalysis,
      period: {
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
        groupBy,
      },
    };
  }

  async getRevenueByChannel(fromDate?: string, toDate?: string, warehouseId?: number) {
    const dateRange = this.getDateRange(fromDate, toDate);

    const where: any = {
      orderStatus: 'completed',
      completedAt: {
        gte: dateRange.fromDate,
        lte: dateRange.toDate,
      },
    };

    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const result = await prisma.invoice.groupBy({
      by: ['salesChannel'],
      where,
      _sum: {
        totalAmount: true,
        paidAmount: true,
      },
      _count: {
        id: true,
      },
    });

    return result.map((item) => ({
      channel: item.salesChannel,
      revenue: Number(item._sum.totalAmount || 0),
      paid: Number(item._sum.paidAmount || 0),
      orderCount: item._count.id,
    }));
  }

  async getRevenueByRegion(fromDate?: string, toDate?: string) {
    const dateRange = this.getDateRange(fromDate, toDate);

    const orders = await prisma.invoice.findMany({
      where: {
        orderStatus: 'completed',
        completedAt: {
          gte: dateRange.fromDate,
          lte: dateRange.toDate,
        },
      },
      include: {
        customer: {
          select: {
            address: true,
          },
        },
      },
    });

    const grouped = orders.reduce((acc, order) => {
      const location = order.customer.address || 'Unknown';
      if (!acc[location]) {
        acc[location] = {
          province: location,
          revenue: 0,
          orderCount: 0,
        };
      }
      acc[location].revenue += Number(order.totalAmount);
      acc[location].orderCount += 1;
      return acc;
    }, {} as Record<string, { province: string; revenue: number; orderCount: number }>);

    return Object.values(grouped).sort((a, b) => b.revenue - a.revenue);
  }

  // =====================================================
  // INVENTORY ANALYTICS
  // =====================================================
  async getInventoryReport(params: InventoryReportParams) {
    const { warehouseId, categoryId, productType, lowStock, searchTerm, showExpiring } = params;

    // Query expiring products if showExpiring is true
    let expiringProductIds: Set<number> | null = null;
    if (showExpiring) {
      const today = new Date();
      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(today.getDate() + 7);

      const expiringProducts = await prisma.expiry.findMany({
        where: {
          endDate: {
            gte: today,
            lte: sevenDaysLater,
          },
          deletedAt: null,
        },
        select: {
          productId: true,
        },
      });

      expiringProductIds = new Set(expiringProducts.map(e => e.productId).filter((id): id is number => id !== null));
    }

    const where: Prisma.InventoryWhereInput = {
      ...(warehouseId && { warehouseId }),
      ...(showExpiring && expiringProductIds && expiringProductIds.size > 0 && {
        productId: {
          in: Array.from(expiringProductIds),
        },
      }),
      ...(productType && {
        // Product type filtering removed as productType field was removed
      }),
      ...((categoryId || searchTerm) && {
        product: {
          ...(categoryId && { categoryId }),
          ...(searchTerm && {
            OR: [
              {
                code: {
                  contains: searchTerm,
                },
              },
              {
                productName: {
                  contains: searchTerm,
                },
              },
            ],
          }),
        },
      }),
    };

    const inventory = await prisma.inventory.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            warehouseName: true,
            warehouseType: true,
          },
        },
        product: {
          select: {
            code: true,
            productName: true,
            unit: true,
            minStockLevel: true,
            basePrice: true,
            category: {
              select: {
                categoryName: true,
              },
            },
          },
        },
      },
    });

    const items = inventory.map((inv) => {
      const availableQty = Number(inv.quantity) - Number(inv.reservedQuantity);
      const value = availableQty * Number(inv.product.basePrice || 0);
      const isLowStock = availableQty < Number(inv.product.minStockLevel);
      
      // Check if product is in expiring list
      const isExpiring = expiringProductIds ? expiringProductIds.has(inv.productId) : false;
      const daysUntilExpiry = null; // We don't calculate exact days here, just check if in expiring list

      return {
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse.warehouseName,
        warehouseType: inv.warehouse.warehouseType,
        productId: inv.productId,
        sku: inv.product.code, // Keep returning sku key for frontend but map to code
        productName: inv.product.productName,
        productType: 'standard', // Hardcode standard as productType was removed
        categoryName: inv.product.category?.categoryName,
        unit: inv.product.unit,
        quantity: Number(inv.quantity),
        reservedQuantity: Number(inv.reservedQuantity),
        availableQuantity: availableQty,
        minStockLevel: Number(inv.product.minStockLevel),
        unitPrice: Number(inv.product.basePrice || 0),
        totalValue: value,
        isLowStock,
        expiryDate: null,
        daysUntilExpiry,
        isExpiring,
      };
    });

    // Apply filters
    let filtered = items;
    if (lowStock) {
      filtered = filtered.filter((item) => item.isLowStock);
    }
    // showExpiring filter is already applied in the query

    const summary = {
      totalItems: filtered.length,
      totalValue: filtered.reduce((sum, item) => sum + item.totalValue, 0),
      lowStockItems: filtered.filter((item) => item.isLowStock).length,
      totalQuantity: filtered.reduce((sum, item) => sum + item.availableQuantity, 0),
    };

    // Group by category
    const byCategory = Object.values(
      filtered.reduce((acc, item) => {
        const category = item.categoryName || 'Khác';
        if (!acc[category]) {
          acc[category] = {
            category: category,
            quantity: 0,
            value: 0,
            itemCount: 0,
          };
        }
        acc[category].quantity += item.availableQuantity;
        acc[category].value += item.totalValue;
        acc[category].itemCount += 1;
        return acc;
      }, {} as Record<string, any>)
    );

    // Top 10 products by quantity
    const topProducts = filtered
      .sort((a, b) => b.availableQuantity - a.availableQuantity)
      .slice(0, 10)
      .map((item) => ({
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.availableQuantity,
        value: item.totalValue,
      }));

    return {
      summary,
      data: filtered,
      byCategory,
      topProducts,
    };
  }

  async getInventoryStockFlow(params: { fromDate?: string; toDate?: string; warehouseId?: number; categoryId?: number; productType?: string }) {
    const { fromDate, toDate, warehouseId, categoryId, productType } = params;
    const dateRange = this.getDateRange(fromDate, toDate);

    // Get all inventory items
    const inventory = await prisma.inventory.findMany({
      where: {
        ...(warehouseId && { warehouseId }),
        ...(productType && {
          // Product type filtering removed 
        }),
        ...(categoryId && {
          product: {
            categoryId,
          },
        }),
      },
      include: {
        product: {
          select: {
            id: true,
            code: true,
            productName: true,
            unit: true,
            basePrice: true,
          },
        },
      },
    });

    // Get stock transactions for the period
    const transactions = await prisma.stockTransactionDetail.findMany({
      where: {
        transaction: {
          createdAt: {
            gte: dateRange.fromDate,
            lte: dateRange.toDate,
          },
        },
      },
      include: {
        transaction: {
          select: {
            transactionType: true,
          },
        },
        product: {
          select: {
            id: true,
          },
        },
      },
    });

    // Group transactions by product
    const transactionsByProduct: Record<number, { imports: number; exports: number }> = {};
    transactions.forEach((trans) => {
      const productId = trans.product.id;
      if (!transactionsByProduct[productId]) {
        transactionsByProduct[productId] = { imports: 0, exports: 0 };
      }
      const qty = Number(trans.quantity);
      if (trans.transaction.transactionType === 'import' || trans.transaction.transactionType === 'transfer') {
        transactionsByProduct[productId].imports += qty;
      } else if (trans.transaction.transactionType === 'export' || trans.transaction.transactionType === 'disposal') {
        transactionsByProduct[productId].exports += qty;
      }
    });

    // Calculate stock flow
    const stockFlow = inventory.map((inv) => {
      const productId = inv.product.id;
      const trans = transactionsByProduct[productId] || { imports: 0, exports: 0 };
      const endingQty = Number(inv.quantity);
      const beginningQty = endingQty + trans.exports - trans.imports;

      return {
        productId,
        sku: inv.product.code,
        productName: inv.product.productName,
        unit: inv.product.unit,
        beginningQuantity: Math.max(0, beginningQty),
        importQuantity: trans.imports,
        exportQuantity: trans.exports,
        endingQuantity: endingQty,
        unitPrice: Number(inv.product.basePrice || 0),
      };
    });

    return stockFlow;
  }

  async getInventoryByType(warehouseId?: number) {
    const where: any = {};
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const result = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            basePrice: true,
          },
        },
      },
    });

    const grouped = result.reduce((acc, inv) => {
      const type = 'standard'; // hardcoded instead of inv.product.productType
      if (!acc[type]) {
        acc[type] = {
          productType: type,
          quantity: 0,
          value: 0,
          itemCount: 0,
        };
      }
      const qty = Number(inv.quantity) - Number(inv.reservedQuantity);
      acc[type].quantity += qty;
      acc[type].value += qty * Number(inv.product.basePrice || 0);
      acc[type].itemCount += 1;
      return acc;
    }, {} as Record<string, { productType: string; quantity: number; value: number; itemCount: number }>);

    return Object.values(grouped);
  }

  async getInventoryTurnover(fromDate?: string, toDate?: string) {
    const dateRange = this.getDateRange(fromDate, toDate);

    // Get stock transactions (exports) during period
    const exports = await prisma.stockTransactionDetail.findMany({
      where: {
        transaction: {
          transactionType: 'export',
          status: 'completed',
          createdAt: {
            gte: dateRange.fromDate,
            lte: dateRange.toDate,
          },
        },
      },
      include: {
        product: {
          select: {
            id: true,
            productName: true,
            code: true,
          },
        },
      },
    });

    // Get current inventory
    const inventory = await prisma.inventory.findMany({
      include: {
        product: {
          select: {
            id: true,
            productName: true,
            code: true,
            basePrice: true,
          },
        },
      },
    });

    const turnoverData = inventory.map((inv) => {
      const productExports = exports.filter((exp) => exp.productId === inv.productId);
      const totalSold = productExports.reduce((sum, exp) => sum + Number(exp.quantity), 0);
      const avgInventory = Number(inv.quantity);
      const turnoverRate = avgInventory > 0 ? totalSold / avgInventory : 0;

      return {
        productId: inv.productId,
        productName: inv.product.productName,
        sku: inv.product.code,
        currentStock: Number(inv.quantity),
        totalSold,
        turnoverRate: Number(turnoverRate.toFixed(2)),
        daysToSell: turnoverRate > 0 ? Math.round(365 / turnoverRate) : 0,
      };
    });

    return turnoverData.sort((a, b) => b.turnoverRate - a.turnoverRate);
  }

  // =====================================================
  // SALES ANALYTICS
  // =====================================================
  async getTopSellingProducts(limit: number = 10, fromDate?: string, toDate?: string) {
    const dateRange = this.getDateRange(fromDate, toDate);

    // Get sales order details with aggregation
    const details = await prisma.invoiceDetail.findMany({
      where: {
        order: {
          orderStatus: 'completed',
          completedAt: {
            gte: dateRange.fromDate,
            lte: dateRange.toDate,
          },
        },
      },
      include: {
        product: {
          select: {
            id: true,
            code: true,
            productName: true,
            unit: true,
            category: {
              select: {
                categoryName: true,
              },
            },
          },
        },
      },
    });

    // Group by product manually
    const grouped = details.reduce((acc, detail) => {
      const key = detail.productId;
      if (!acc[key]) {
        acc[key] = {
          productId: detail.productId,
          productName: detail.product.productName,
          sku: detail.product.code,
          categoryName: detail.product.category?.categoryName,
          unit: detail.product.unit,
          quantitySold: 0,
          revenue: 0,
          orderCount: 0,
        };
      }
      acc[key].quantitySold += Number(detail.quantity);
      acc[key].revenue += Number(detail.unitPrice || 0) * Number(detail.quantity);
      acc[key].orderCount += 1;
      return acc;
    }, {} as Record<number, any>);

    return Object.values(grouped)
      .sort((a: any, b: any) => b.quantitySold - a.quantitySold)
      .slice(0, limit);
  }

  async getTopCustomers(limit: number = 10, fromDate?: string, toDate?: string) {
    const dateRange = this.getDateRange(fromDate, toDate);

    const result = await prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        orderStatus: 'completed',
        completedAt: {
          gte: dateRange.fromDate,
          lte: dateRange.toDate,
        },
      },
      _sum: {
        totalAmount: true,
        paidAmount: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          totalAmount: 'desc',
        },
      },
      take: limit,
    });

    const customerIds = result.map((r) => r.customerId);
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        classification: true,
        currentDebt: true,
      },
    });

    return result.map((item) => {
      const customer = customers.find((c) => c.id === item.customerId);
      return {
        customerId: item.customerId,
        customerCode: customer?.customerCode,
        customerName: customer?.customerName || 'Unknown',
        classification: customer?.classification,
        totalRevenue: Number(item._sum.totalAmount || 0),
        totalPaid: Number(item._sum.paidAmount || 0),
        orderCount: item._count.id,
        currentDebt: Number(customer?.currentDebt || 0),
      };
    });
  }

  // =====================================================
  // COMPLETE SALES REPORT (New endpoint)
  // =====================================================
  async getSalesReport(params: {
    fromDate?: string;
    toDate?: string;
    warehouseId?: number;
    salesChannel?: string;
    customerId?: number;
    createdBy?: number;          // NEW: Filter by staff who created order
    orderStatus?: string;         // NEW: Filter by order status
  }) {
    const { fromDate, toDate, warehouseId, salesChannel, customerId, createdBy, orderStatus } = params;
    const dateRange = this.getDateRange(fromDate, toDate);

    // Build where clause with dynamic filters
    const where: any = {
      orderDate: {
        gte: dateRange.fromDate,
        lte: dateRange.toDate,
      },
      orderStatus: { not: 'cancelled' }, // Exclude cancelled, include all others by default
    };

    // Status filter - if specified, override default
    if (orderStatus) {
      where.orderStatus = orderStatus;
    }

    // Optional filters
    if (warehouseId) where.warehouseId = warehouseId;
    if (salesChannel) where.salesChannel = salesChannel;
    if (customerId) where.customerId = customerId;
    if (createdBy) where.createdBy = createdBy;

    // 1. KPI Summary
    const orders = await prisma.invoice.findMany({
      where,
      include: {
        details: {
          include: { product: { select: { basePrice: true } } },
        },
      },
    });

    // Calculate KPIs
    const totalNetRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0) - Number(o.discountAmount || 0), 0);
    const totalNewDebt = orders.reduce((sum, o) => sum + (Number(o.totalAmount || 0) - Number(o.paidAmount || 0)), 0);
    const totalOrders = orders.length;
    const cancelledOrders = await prisma.invoice.count({
      where: { ...where, orderStatus: 'cancelled' },
    });
    const completedOrders = await prisma.invoice.count({
      where: { ...where, orderStatus: 'completed' },
    });

    // Estimated profit
    let estimatedProfit = 0;
    orders.forEach((order) => {
      order.details.forEach((detail: any) => {
        const cost = Number(detail.product.basePrice || 0) * Number(detail.quantity || 0);
        const revenue = Number(detail.unitPrice || 0) * Number(detail.quantity || 0);
        estimatedProfit += revenue - cost;
      });
    });

    const previousOrders = await prisma.invoice.findMany({
      where: {
        ...where,
        orderDate: {
          gte: new Date(dateRange.fromDate.getTime() - (dateRange.toDate.getTime() - dateRange.fromDate.getTime())),
          lte: dateRange.fromDate,
        },
      },
    });
    const previousRevenue = previousOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const netRevenueGrowth = previousRevenue > 0 ? ((totalNetRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const profitMargin = totalNetRevenue > 0 ? (estimatedProfit / totalNetRevenue) * 100 : 0;
    const debtPercentage = totalNetRevenue > 0 ? (totalNewDebt / totalNetRevenue) * 100 : 0;

    const summary = {
      netRevenue: totalNetRevenue,
      netRevenueGrowth,
      estimatedProfit,
      profitMargin,
      totalOrders,
      cancelledOrders,
      completedOrders,
      newDebt: totalNewDebt,
      totalDebt: await prisma.customer.aggregate({
        _sum: { currentDebt: true },
      }).then(r => Number(r._sum.currentDebt || 0)),
      debtPercentage,
    };

    // 2. Trend data (by day)
    const trendMap = new Map<string, any>();
    orders.forEach((order) => {
      const date = order.orderDate.toISOString().split('T')[0];
      if (!trendMap.has(date)) {
        trendMap.set(date, {
          date,
          totalRevenue: 0,
          paidRevenue: 0,
          orderCount: 0,
          debtAmount: 0,
        });
      }
      const trend = trendMap.get(date);
      trend.totalRevenue += Number(order.totalAmount || 0);
      trend.paidRevenue += Number(order.paidAmount || 0);
      trend.orderCount += 1;
      trend.debtAmount += Number(order.totalAmount || 0) - Number(order.paidAmount || 0);
    });

    const trends = Array.from(trendMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 3. By Sales Channel
    const byChannelMap = new Map<string, any>();
    orders.forEach((order) => {
      const channel = order.salesChannel || 'unknown';
      if (!byChannelMap.has(channel)) {
        byChannelMap.set(channel, {
          channel,
          displayName: this.getChannelName(channel),
          totalRevenue: 0,
          netRevenue: 0,
          discount: 0,
          tax: 0,
          shipping: 0,
          paidAmount: 0,
          debtAmount: 0,
          orderCount: 0,
        });
      }
      const item = byChannelMap.get(channel);
      item.totalRevenue += Number(order.totalAmount || 0);
      item.netRevenue += Number(order.totalAmount || 0) - Number(order.discountAmount || 0);
      item.discount += Number(order.discountAmount || 0);
      item.tax += Number(order.taxAmount || 0);
      item.shipping += Number(order.shippingFee || 0);
      item.paidAmount += Number(order.paidAmount || 0);
      item.debtAmount += Number(order.totalAmount || 0) - Number(order.paidAmount || 0);
      item.orderCount += 1;
    });

    const byChannel = Array.from(byChannelMap.values()).map((item) => ({
      ...item,
      percentage: totalNetRevenue > 0 ? (item.netRevenue / totalNetRevenue) * 100 : 0,
    }));

    // 4. Top Products
    const topProducts = await this.getTopSellingProducts(10, fromDate, toDate);

    // 5. Staff Performance
    const staffPerformance = await prisma.invoice.groupBy({
      by: ['createdBy'],
      where,
      _sum: {
        totalAmount: true,
        paidAmount: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          totalAmount: 'desc',
        },
      },
      take: 10,
    });

    const staffIds = staffPerformance.map((s) => s.createdBy);
    const staffUsers = await prisma.user.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, fullName: true, avatarUrl: true },
    });

    const staffList = staffPerformance.map((item) => {
      const user = staffUsers.find((u) => u.id === item.createdBy);
      const staffOrders = orders.filter((o) => o.createdBy === item.createdBy);
      const debtAmount = staffOrders.reduce((sum, o) => sum + (Number(o.totalAmount || 0) - Number(o.paidAmount || 0)), 0);
      return {
        staffId: item.createdBy,
        staffName: user?.fullName || 'Unknown',
        avatar: user?.avatarUrl || undefined,
        totalOrders: item._count.id,
        totalRevenue: Number(item._sum.totalAmount || 0),
        paidRevenue: Number(item._sum.paidAmount || 0),
        debtAmount,
        completionRate: item._count.id > 0 ? 100 : 0,
      };
    });

    // 6. Top Customers
    const topCustomers = await this.getTopCustomers(10, fromDate, toDate);

    return {
      period: {
        fromDate: dateRange.fromDate.toISOString().split('T')[0],
        toDate: dateRange.toDate.toISOString().split('T')[0],
        days: Math.ceil((dateRange.toDate.getTime() - dateRange.fromDate.getTime()) / (1000 * 60 * 60 * 24)),
      },
      summary,
      trends,
      byChannel,
      topProducts,
      staffPerformance: staffList,
      topCustomers,
    };
  }

  private getChannelName(channel: string): string {
    const names: Record<string, string> = {
      retail: 'Bán lẻ',
      wholesale: 'Bán sỉ',
      online: 'Online',
      distributor: 'Đại lý',
    };
    return names[channel] || channel;
  }

  // =====================================================
  // PRODUCTION ANALYTICS (REMOVED)
  // =====================================================
  async getProductionReport(_fromDate?: string, _toDate?: string) {
    return { summary: { totalOrders: 0, totalPlanned: 0, totalProduced: 0, totalCost: 0, averageEfficiency: 0 }, data: [] };
  }

  async getWastageReport(_fromDate?: string, _toDate?: string) {
    return { summary: { totalWastageCost: 0, totalOccurrences: 0, affectedProducts: 0 }, data: [] };
  }

  // =====================================================
  // EMPLOYEE PERFORMANCE
  // =====================================================
  async getEmployeePerformance(fromDate?: string, toDate?: string) {
    const dateRange = this.getDateRange(fromDate, toDate);

    const salesByEmployee = await prisma.invoice.groupBy({
      by: ['createdBy'],
      where: {
        orderStatus: 'completed',
        completedAt: {
          gte: dateRange.fromDate,
          lte: dateRange.toDate,
        },
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        id: true,
      },
    });

    const employeeIds = salesByEmployee.map((s) => s.createdBy);
    const employees = await prisma.user.findMany({
      where: { id: { in: employeeIds as any[] } },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        role: {
          select: {
            roleName: true,
          },
        },
      },
    });

    return salesByEmployee
      .map((item) => {
        const employee = employees.find((e) => e.id === item.createdBy);
        return {
          employeeId: item.createdBy,
          employeeCode: employee?.employeeCode,
          fullName: employee?.fullName || 'Unknown',
          roleName: employee?.role.roleName,
          totalRevenue: Number(item._sum.totalAmount || 0),
          orderCount: item._count.id,
          averageOrderValue:
            item._count.id > 0 ? Number(item._sum.totalAmount || 0) / item._count.id : 0,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  // =====================================================
  // FINANCIAL ANALYTICS
  // =====================================================
  async getFinancialSummary(fromDate?: string, toDate?: string) {
    const dateRange = this.getDateRange(fromDate, toDate);

    const [receipts, vouchers, invoices] = await Promise.all([
      prisma.paymentReceipt.aggregate({
        where: {
          receiptDate: {
            gte: dateRange.fromDate,
            lte: dateRange.toDate,
          },
          approvedBy: {
            not: null,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      }),
      prisma.paymentVoucher.aggregate({
        where: {
          paymentDate: {
            gte: dateRange.fromDate,
            lte: dateRange.toDate,
          },
          approvedBy: {
            not: null,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      }),
      prisma.invoice.aggregate({
        where: {
          orderStatus: 'completed',
          completedAt: {
            gte: dateRange.fromDate,
            lte: dateRange.toDate,
          },
        },
        _sum: {
          totalAmount: true,
          paidAmount: true,
        },
      }),
    ]);

    const totalReceipts = Number(receipts._sum.amount || 0);
    const totalPayments = Number(vouchers._sum.amount || 0);
    const totalRevenue = Number(invoices._sum.totalAmount || 0);
    const totalPaid = Number(invoices._sum.paidAmount || 0);

    return {
      revenue: {
        total: totalRevenue,
        paid: totalPaid,
        outstanding: totalRevenue - totalPaid,
      },
      receipts: {
        total: totalReceipts,
        count: receipts._count.id,
      },
      payments: {
        total: totalPayments,
        count: vouchers._count.id,
      },
      cashFlow: {
        netCashFlow: totalReceipts - totalPayments,
        operatingCashFlow: totalPaid - totalPayments,
      },
    };
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================
  private getDateRange(fromDate?: string, toDate?: string): DateRange {
    const today = new Date();
    const from = fromDate ? new Date(fromDate) : new Date(today.getFullYear(), today.getMonth(), 1);

    // Normalize from to start of day (00:00:00.000)
    from.setHours(0, 0, 0, 0);

    const to = toDate ? new Date(toDate) : new Date(today.setHours(23, 59, 59, 999));

    // Normalize to to end of day (23:59:59.999)
    to.setHours(23, 59, 59, 999);

    return { fromDate: from, toDate: to };
  }

  private async getRevenueByPeriod(fromDate: Date, toDate: Date, warehouseId?: number): Promise<number> {
    const result = await prisma.invoice.aggregate({
      where: {
        orderStatus: 'completed',
        completedAt: {
          gte: fromDate,
          lte: toDate,
        },
        ...(warehouseId && { warehouseId }),
      },
      _sum: {
        totalAmount: true,
      },
    });

    return Number(result._sum.totalAmount || 0);
  }

  private async getOrderCountByPeriod(fromDate: Date, toDate: Date, warehouseId?: number): Promise<number> {
    return await prisma.invoice.count({
      where: {
        orderStatus: 'completed',
        completedAt: {
          gte: fromDate,
          lte: toDate,
        },
        ...(warehouseId && { warehouseId }),
      },
    });
  }

  private async getTotalInventoryValue(warehouseId?: number): Promise<number> {
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;

    const inventory = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            basePrice: true,
          },
        },
      },
    });

    return inventory.reduce((sum, inv) => {
      const qty = Number(inv.quantity) - Number(inv.reservedQuantity);
      return sum + qty * Number(inv.product.basePrice || 0);
    }, 0);
  }

  private async getLowStockCount(warehouseId?: number): Promise<number> {
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;

    const inventory = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            minStockLevel: true,
          },
        },
      },
    });

    return inventory.filter((inv) => {
      const available = Number(inv.quantity) - Number(inv.reservedQuantity);
      return available < Number(inv.product.minStockLevel);
    }).length;
  }

  private async getExpiringProductsCount(days: number): Promise<number> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const items = await prisma.stockTransactionDetail.findMany({
      where: {
        expiryDate: {
          lte: futureDate,
          gt: new Date(),
        },
      },
      select: {
        productId: true,
        batchNumber: true,
      },
    });

    // Count unique combinations of productId and batchNumber
    const uniqueItems = new Set(items.map((item) => `${item.productId}-${item.batchNumber}`));
    return uniqueItems.size;
  }

  private async getTotalReceivables(): Promise<number> {
    const result = await prisma.customer.aggregate({
      where: {
        currentDebt: {
          gt: 0,
        },
      },
      _sum: {
        currentDebt: true,
      },
    });

    return Number(result._sum.currentDebt || 0);
  }

  private async getOverdueDebtCount(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return await prisma.customer.count({
      where: {
        currentDebt: {
          gt: 0,
        },
        debtUpdatedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });
  }

  // =====================================================
  // NEW: API 1 - KPI SUMMARY (4 KPI Cards)
  // =====================================================
  async getSalesSummary(params: {
    fromDate?: string;
    toDate?: string;
    warehouseId?: number;
    salesChannel?: string;
    customerId?: number;
    createdBy?: number;
  }) {
    const { fromDate, toDate, warehouseId, salesChannel, customerId, createdBy } = params;
    const dateRange = this.getDateRange(fromDate, toDate);

    const where: any = {
      orderStatus: { not: 'cancelled' },
      orderDate: {
        gte: dateRange.fromDate,
        lte: dateRange.toDate,
      },
    };

    if (warehouseId) where.warehouseId = warehouseId;
    if (salesChannel) where.salesChannel = salesChannel;
    if (customerId) where.customerId = customerId;
    if (createdBy) where.createdBy = createdBy;

    // Summary aggregation
    const summary = await prisma.invoice.aggregate({
      where,
      _sum: {
        totalAmount: true,
        paidAmount: true,
      },
      _count: {
        id: true,
      },
    });

    // Get cost for profit calculation
    const orders = await prisma.invoice.findMany({
      where,
      include: {
        details: {
          include: { product: { select: { basePrice: true } } },
        },
      },
    });

    let profit = 0;
    orders.forEach((order) => {
      order.details.forEach((detail: any) => {
        const cost = Number(detail.product.basePrice || 0) * Number(detail.quantity || 0);
        const revenue = Number(detail.unitPrice || 0) * Number(detail.quantity || 0);
        profit += revenue - cost;
      });
    });

    const totalAmount = Number(summary._sum?.totalAmount || 0);
    const totalPaid = Number(summary._sum?.paidAmount || 0);
    const totalDebt = totalAmount - totalPaid;

    return {
      totalRevenue: totalAmount,
      orderCount: summary._count?.id || 0,
      totalDebt: totalDebt,
      estimatedProfit: profit,
    };
  }

  // =====================================================
  // NEW: API 2 - CHARTS DATA
  // =====================================================
  async getSalesCharts(params: {
    fromDate?: string;
    toDate?: string;
    warehouseId?: number;
    salesChannel?: string;
    customerId?: number;
    createdBy?: number;
  }) {
    const { fromDate, toDate, warehouseId, salesChannel, customerId, createdBy } = params;
    const dateRange = this.getDateRange(fromDate, toDate);

    const where: any = {
      orderStatus: { not: 'cancelled' },
      orderDate: {
        gte: dateRange.fromDate,
        lte: dateRange.toDate,
      },
    };

    if (warehouseId) where.warehouseId = warehouseId;
    if (salesChannel) where.salesChannel = salesChannel;
    if (customerId) where.customerId = customerId;
    if (createdBy) where.createdBy = createdBy;

    // Get all orders
    const orders = await prisma.invoice.findMany({
      where,
      select: {
        orderDate: true,
        totalAmount: true,
        salesChannel: true,
      },
    });

    // Chart 1: By time (daily)
    const timelineMap = new Map<string, number>();
    orders.forEach((order) => {
      const date = order.orderDate.toISOString().split('T')[0];
      const current = timelineMap.get(date) || 0;
      timelineMap.set(date, current + Number(order.totalAmount || 0));
    });

    const timeline = Array.from(timelineMap.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Chart 2: By channel (pie)
    const channelMap = new Map<string, number>();
    orders.forEach((order) => {
      const channel = order.salesChannel || 'unknown';
      const current = channelMap.get(channel) || 0;
      channelMap.set(channel, current + Number(order.totalAmount || 0));
    });

    const byChannel = Array.from(channelMap.entries()).map(([channel, value]) => ({
      channel,
      value,
    }));

    return {
      timeline,
      byChannel,
    };
  }

  // =====================================================
  // NEW: API 3 - TOP ANALYSIS (Products, Staff, Customers)
  // =====================================================
  async getSalesTopAnalysis(params: {
    fromDate?: string;
    toDate?: string;
    warehouseId?: number;
    salesChannel?: string;
    customerId?: number;
    createdBy?: number;
    type: 'product' | 'staff' | 'customer';
  }) {
    const { fromDate, toDate, warehouseId, salesChannel, customerId, createdBy, type } = params;
    const dateRange = this.getDateRange(fromDate, toDate);

    const where: any = {
      orderStatus: { not: 'cancelled' },
      orderDate: {
        gte: dateRange.fromDate,
        lte: dateRange.toDate,
      },
    };

    if (warehouseId) where.warehouseId = warehouseId;
    if (salesChannel) where.salesChannel = salesChannel;
    if (customerId) where.customerId = customerId;
    if (createdBy) where.createdBy = createdBy;

    if (type === 'product') {
      // Top Products
      const details = await prisma.invoiceDetail.findMany({
        where: { order: where },
        include: {
          product: { select: { id: true, productName: true, code: true } },
        },
      });

      const productMap = new Map<number, any>();
      details.forEach((detail) => {
        const key = detail.productId;
        if (!productMap.has(key)) {
          productMap.set(key, {
            id: detail.productId,
            productName: detail.product.productName,
            sku: detail.product.code,
            totalQty: 0,
            totalRevenue: 0,
          });
        }
        const item = productMap.get(key);
        item.totalQty += Number(detail.quantity || 0);
        item.totalRevenue += Number(detail.unitPrice || 0) * Number(detail.quantity || 0);
      });

      return Array.from(productMap.values()).sort(
        (a, b) => b.totalRevenue - a.totalRevenue
      );
    } else if (type === 'staff') {
      // Top Staff
      const staffData = await prisma.invoice.groupBy({
        by: ['createdBy'],
        where,
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      const userIds = staffData.map((s) => s.createdBy);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, employeeCode: true },
      });

      return staffData
        .map((item) => {
          const user = users.find((u) => u.id === item.createdBy);
          return {
            id: item.createdBy,
            fullName: user?.fullName || 'Unknown',
            employeeCode: user?.employeeCode,
            orderCount: item._count?.id || 0,
            totalRevenue: Number(item._sum?.totalAmount || 0),
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
    } else {
      // Top Customers
      const custData = await prisma.invoice.groupBy({
        by: ['customerId'],
        where,
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      const custIds = custData.map((c) => c.customerId);
      const customers = await prisma.customer.findMany({
        where: { id: { in: custIds } },
        select: { id: true, customerName: true, phone: true, currentDebt: true },
      });

      return custData
        .map((item) => {
          const cust = customers.find((c) => c.id === item.customerId);
          return {
            id: item.customerId,
            customerName: cust?.customerName || 'Unknown',
            phone: cust?.phone,
            totalSpent: Number(item._sum?.totalAmount || 0),
            currentDebt: Number(cust?.currentDebt || 0),
          };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent);
    }
  }

  // =====================================================
  // NEW: API 4 - FILTER OPTIONS (Search Customer, Get Staff)
  // =====================================================
  async getFilterOptions(action: 'search-customer' | 'get-sales-staff', keyword?: string) {
    if (action === 'search-customer') {
      const customers = await prisma.customer.findMany({
        where: {
          OR: [
            { customerName: { contains: keyword || '' } },
            { phone: { contains: keyword || '' } },
          ],
        },
        select: { id: true, customerName: true, phone: true },
        take: 10,
      });
      return customers;
    } else if (action === 'get-sales-staff') {
      // Get users who created at least one order
      const staffIds = await prisma.invoice
        .findMany({
          select: { createdBy: true },
          distinct: ['createdBy'],
        })
        .then((orders) => [...new Set(orders.map((o) => o.createdBy))]);

      const staff = await prisma.user.findMany({
        where: { id: { in: staffIds as any[] } },
        select: { id: true, fullName: true, employeeCode: true },
      });
      return staff;
    }
    return [];
  }

  private groupByPeriod(
    data: any[],
    groupBy: 'day' | 'week' | 'month' | 'year',
    dateField: string
  ): any[] {
    const grouped = {} as Record<string, any>;

    data.forEach((item) => {
      const date = new Date(item[dateField]);
      let key: string;

      switch (groupBy) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'year':
          key = String(date.getFullYear());
          break;
        default:
          key = date.toISOString().split('T')[0];
      }

      if (!grouped[key]) {
        grouped[key] = {
          period: key,
          revenue: 0,
          discount: 0,
          tax: 0,
          shipping: 0,
          paid: 0,
          orderCount: 0,
        };
      }

      grouped[key].revenue += Number(item.totalAmount);
      grouped[key].discount += Number(item.discountAmount);
      grouped[key].tax += Number(item.taxAmount);
      grouped[key].shipping += Number(item.shippingFee);
      grouped[key].paid += Number(item.paidAmount);
      grouped[key].orderCount += 1;
    });

    return Object.values(grouped).sort((a: any, b: any) => a.period.localeCompare(b.period));
  }

  // =====================================================
  // FILTER OPTIONS
  // =====================================================
  
  // Get warehouses for filter (truy vấn trực tiếp)
  async getWarehousesForFilter() {
    const warehouses = await prisma.warehouse.findMany({
      where: {
        status: 'active',
      },
      select: {
        id: true,
        warehouseCode: true,
        warehouseName: true,
        warehouseType: true,
        city: true,
        region: true,
      },
      orderBy: {
        warehouseName: 'asc',
      },
    });

    return warehouses;
  }
}

export default new ReportService();
