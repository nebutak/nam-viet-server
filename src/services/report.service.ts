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
      cashFundData,
      expiringItems,
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
      // Cash fund: total receipts - total vouchers (posted ones)
      Promise.all([
        prisma.paymentReceipt.aggregate({ where: { isPosted: true }, _sum: { amount: true } }),
        prisma.paymentVoucher.aggregate({ where: { status: 'posted' }, _sum: { amount: true } }),
      ]),
      // Expiring Items
      prisma.inventoryBatch.findMany({
        where: {
          ...(warehouseId && { warehouseId }),
          expiryDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          },
          quantity: { gt: 0 }
        },
        include: {
          product: { select: { id: true, productName: true, code: true } },
          warehouse: { select: { id: true, warehouseName: true } }
        },
        take: 3,
        orderBy: { expiryDate: 'asc' }
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

    // Format expiring items
    const formattedExpiringItems = expiringItems.map((batch: any) => ({
      product_id: batch.product.id,
      product_name: batch.product.productName,
      sku: batch.product.code,
      batch_number: batch.batchNumber,
      expiry_date: batch.expiryDate,
      current_stock: Number(batch.quantity),
      warehouse_id: batch.warehouse.id,
      warehouse_name: batch.warehouse.warehouseName,
    }));

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
        expiring: formattedExpiringItems,
        cash_fund: Number(cashFundData[0]._sum.amount || 0) - Number(cashFundData[1]._sum.amount || 0),
        pending_orders_count: ordersPending,
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
        details: {
          select: {
            quantity: true,
            product: { select: { basePrice: true } }
          }
        }
      },
      orderBy: { completedAt: 'asc' },
    });

    const grouped: Record<string, { date: string; revenue: number; expense: number }> = {};
    
    // Prepopulate zero-values for all days in the range to ensure continuous chart
    let curr = new Date(fromDate);
    const end = new Date(toDate);
    while (curr <= end) {
      const key = curr.toISOString().split('T')[0];
      grouped[key] = { date: key, revenue: 0, expense: 0 };
      curr.setDate(curr.getDate() + 1);
    }

    // Populate with actual data
    orders.forEach((order) => {
      const date = new Date(order.completedAt!);
      const key = date.toISOString().split('T')[0];

      if (!grouped[key]) {
        grouped[key] = {
          date: key,
          revenue: 0,
          expense: 0,
        };
      }

      grouped[key].revenue += Number(order.totalAmount);
      
      // Calculate Cost of Goods Sold (Expense) for this order
      const cogs = order.details.reduce((sum, d) => {
        return sum + (Number(d.quantity) * Number(d.product?.basePrice || 0));
      }, 0);
      grouped[key].expense += cogs;
    });

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
      ...(salesChannel && { isPickupOrder: salesChannel === 'pickup' }),
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
        isPickupOrder: true,
        customer: {
          select: {
            id: true,
            customerName: true,
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
      grossRevenue: totalRevenue + totalDiscount, // Add back discount to get gross
      netRevenue: totalRevenue, // totalAmount is already net (after discount)
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
      finalAmount: Number(o.totalAmount), // totalAmount already includes all calculations
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
      by: ['isPickupOrder'],
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
      channel: item.isPickupOrder ? 'Bán tại quầy' : 'Giao hàng',
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
            unit: {
              select: {
                unitName: true,
              },
            },
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
        unit: inv.product.unit?.unitName || null,
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
          ...(warehouseId && { warehouseId }),
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

  async getInventoryNXTReport(params: {
    fromDate?: string;
    toDate?: string;
    warehouseId?: string | number;
    categoryId?: string | number;
  }) {
    const { fromDate, toDate } = params;
    const warehouseId = params.warehouseId ? Number(params.warehouseId) : undefined;
    const categoryId = params.categoryId ? Number(params.categoryId) : undefined;
    
    const dateRange = this.getDateRange(fromDate, toDate);

    // 1. Get products and current inventory
    const inventory = await prisma.inventory.findMany({
      where: {
        ...(warehouseId && { warehouseId }),
        ...(categoryId && {
          product: {
            categoryId,
          },
        }),
      },
      include: {
        warehouse: true,
        product: {
          include: {
            unit: true,
            category: true,
          },
        },
      },
    });

    // 2. Get all transactions from fromDate to NOW to calculate opening stock
    // OpeningStock = CurrentStock - sum(Changes from fromDate to NOW)
    const transactionsAfterFrom = await prisma.stockTransactionDetail.findMany({
      where: {
        transaction: {
          createdAt: { gte: dateRange.fromDate },
          isPosted: true,
          ...(warehouseId && { warehouseId }),
        },
      },
      include: {
        transaction: { select: { transactionType: true, createdAt: true, warehouseId: true } },
      },
    });

    // 3. Get transactions within period for report
    const transactionsWithinPeriod = transactionsAfterFrom.filter(
      (t) => t.transaction.createdAt <= dateRange.toDate
    );

    // Group transactions by product AND warehouse
    const changesAfterFrom: Record<string, { imports: number; exports: number }> = {};
    const changesWithinPeriod: Record<string, { imports: number; exports: number }> = {};

    transactionsAfterFrom.forEach((t) => {
      const pId = `${t.transaction.warehouseId}-${t.productId}`;
      if (!changesAfterFrom[pId]) changesAfterFrom[pId] = { imports: 0, exports: 0 };
      
      const qty = Number(t.quantity);
      if (['import', 'transfer_in', 'return'].includes(t.transaction.transactionType)) {
        changesAfterFrom[pId].imports += qty;
      } else if (['export', 'transfer_out', 'disposal'].includes(t.transaction.transactionType)) {
        changesAfterFrom[pId].exports += qty;
      }
    });

    transactionsWithinPeriod.forEach((t) => {
      const pId = `${t.transaction.warehouseId}-${t.productId}`;
      if (!changesWithinPeriod[pId]) changesWithinPeriod[pId] = { imports: 0, exports: 0 };
      
      const qty = Number(t.quantity);
      if (['import', 'transfer_in', 'return'].includes(t.transaction.transactionType)) {
        changesWithinPeriod[pId].imports += qty;
      } else if (['export', 'transfer_out', 'disposal'].includes(t.transaction.transactionType)) {
        changesWithinPeriod[pId].exports += qty;
      }
    });

    // 4. Build report data
    const report = inventory.map((inv) => {
      const pIdKey = `${inv.warehouseId}-${inv.productId}`;
      const pId = inv.productId;
      const product = inv.product;
      const basePrice = Number(product.basePrice || 0);
      
      const afterFrom = changesAfterFrom[pIdKey] || { imports: 0, exports: 0 };
      const withinPeriod = changesWithinPeriod[pIdKey] || { imports: 0, exports: 0 };
      
      const currentQty = Number(inv.quantity);
      // Opening = Current - (Imports-After-From) + (Exports-After-From)
      const openingQuantity = currentQty - afterFrom.imports + afterFrom.exports;
      
      const quantityIn = withinPeriod.imports;
      const quantityOut = withinPeriod.exports;
      
      const closingQuantity = openingQuantity + quantityIn - quantityOut;

      return {
        productId: pId,
        warehouse: inv.warehouse ? { id: inv.warehouseId, name: (inv.warehouse as any).warehouseName } : null,
        product: {
          id: product.id,
          name: product.productName,
          code: product.code,
          unit: product.unit ? { name: (product.unit as any).unitName } : null,
          category: product.category ? { name: (product.category as any).categoryName } : null,
        },
        openingQuantity: Math.max(0, openingQuantity),
        openingAmount: Math.max(0, openingQuantity) * basePrice,
        quantityIn,
        amountIn: quantityIn * basePrice,
        quantityOut,
        amountOut: quantityOut * basePrice,
        closingQuantity,
        closingAmount: closingQuantity * basePrice,
        averageUnitPrice: basePrice,
      };
    });

    const finalReport = report.filter(
      (r) =>
        r.openingQuantity > 0 ||
        r.quantityIn > 0 ||
        r.quantityOut > 0 ||
        r.closingQuantity > 0
    );

    return finalReport;
  }

  async getInventoryLedger(params: {
    productId: number;
    fromDate?: string;
    toDate?: string;
    warehouseId?: number;
  }) {
    const { productId, fromDate, toDate, warehouseId } = params;
    const dateRange = this.getDateRange(fromDate, toDate);

    // 1. Get product info
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { unit: true },
    });

    if (!product) {
      throw new Error('Sản phẩm không tồn tại');
    }

    const basePrice = Number(product.basePrice || 0);

    // 2. Fetch all relevant transactions for opening balance
    const openingTransactions = await prisma.stockTransactionDetail.findMany({
      where: {
        productId,
        transaction: {
          isPosted: true,
          createdAt: { lt: dateRange.fromDate },
          ...(warehouseId && {
            OR: [
              { warehouseId },
              { sourceWarehouseId: warehouseId },
              { destinationWarehouseId: warehouseId },
            ],
          }),
        },
      },
      include: {
        transaction: true,
      },
    });

    let openingQty = 0;
    openingTransactions.forEach((t: any) => {
      const qty = Number(t.quantity);
      const tt = t.transaction;
      const type = tt.transactionType;
      
      if (type === 'transfer') {
        if (warehouseId) {
          if (tt.sourceWarehouseId === warehouseId) openingQty -= qty;
          else if (tt.destinationWarehouseId === warehouseId) openingQty += qty;
        }
      } else if (['import', 'stocktake', 'return', 'transfer_in'].includes(type as string)) {
        openingQty += qty;
      } else if (['export', 'disposal', 'transfer_out'].includes(type as string)) {
        openingQty -= qty;
      }
    });

    // 3. Get transactions within period
    const periodTransactions = await prisma.stockTransactionDetail.findMany({
      where: {
        productId,
        transaction: {
          isPosted: true,
          createdAt: {
            gte: dateRange.fromDate,
            lte: dateRange.toDate,
          },
          ...(warehouseId && {
            OR: [
              { warehouseId },
              { sourceWarehouseId: warehouseId },
              { destinationWarehouseId: warehouseId },
            ],
          }),
        },
      },
      include: {
        transaction: {
          include: {
            creator: { select: { fullName: true } },
          }
        },
        product: {
          include: { unit: true }
        }
      },
      orderBy: {
        transaction: {
          createdAt: 'asc',
        },
      },
    });

    let runningQty = openingQty;
    const data = periodTransactions.map((t: any) => {
      const qty = Number(t.quantity);
      const tt = t.transaction;
      const type = tt.transactionType;
      let qtyIn = 0;
      let qtyOut = 0;

      if (type === 'transfer') {
        if (warehouseId) {
          if (tt.sourceWarehouseId === warehouseId) qtyOut = qty;
          else if (tt.destinationWarehouseId === warehouseId) qtyIn = qty;
        }
      } else if (['import', 'stocktake', 'return', 'transfer_in'].includes(type as string)) {
        qtyIn = qty;
      } else if (['export', 'disposal', 'transfer_out'].includes(type as string)) {
        qtyOut = qty;
      }

      runningQty += (qtyIn - qtyOut);

      return {
        documentCode: tt.transactionCode,
        postingDate: tt.createdAt,
        description: tt.reason || tt.notes || '',
        objectName: '', 
        unit: t.product?.unit ? { name: t.product.unit.unitName } : null,
        qtyIn,
        amountIn: qtyIn * basePrice,
        qtyOut,
        amountOut: qtyOut * basePrice,
        balanceQty: runningQty,
        balanceAmount: runningQty * basePrice,
        unitCost: basePrice,
      };
    });

    return {
      product: {
        id: product.id,
        name: product.productName,
        code: product.code,
      },
      openingBalance: {
        quantity: openingQty,
        amount: openingQty * basePrice,
      },
      data,
    };
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
            category: { select: { categoryName: true } },
          },
        },
      },
    });

    const grouped = result.reduce((acc, inv) => {
      const type = inv.product.category?.categoryName || 'Chưa phân loại';
      if (!acc[type]) {
        acc[type] = {
          type: type,
          productType: type, // Keeping for frontend backward compatibility
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
    }, {} as Record<string, { type: string; productType: string; quantity: number; value: number; itemCount: number }>);

    return Object.values(grouped);
  }

  async getInventoryTurnover(fromDate?: string, toDate?: string) {
    const dateRange = this.getDateRange(fromDate, toDate);

    // Get stock transactions (exports) during period
    const exports = await prisma.stockTransactionDetail.findMany({
      where: {
        transaction: {
          transactionType: 'export',
          isPosted: true,
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
  async getTopSellingProducts(limit: number = 10, fromDate?: string, toDate?: string, sortBy: 'revenue' | 'quantity' = 'quantity') {
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
      acc[key].revenue += Number(detail.price || 0) * Number(detail.quantity);
      acc[key].orderCount += 1;
      return acc;
    }, {} as Record<number, any>);

    return Object.values(grouped)
      .sort((a: any, b: any) => sortBy === 'revenue' ? b.revenue - a.revenue : b.quantitySold - a.quantitySold)
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
        currentDebt: true,
      },
    });

    return result.map((item) => {
      const customer = customers.find((c) => c.id === item.customerId);
      return {
        customerId: item.customerId,
        customerCode: customer?.customerCode,
        customerName: customer?.customerName || 'Unknown',
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
    if (salesChannel) where.isPickupOrder = salesChannel === 'pickup';
    if (customerId) where.customerId = customerId;
    if (createdBy) where.createdBy = createdBy;

    // 1. KPI Summary + raw orders for detail tables
    const orders = await prisma.invoice.findMany({
      where,
      include: {
        details: {
          include: { product: { select: { basePrice: true, code: true, productName: true, unit: { select: { unitName: true } } } } },
        },
        customer: { select: { id: true, customerName: true, customerCode: true, currentDebt: true } },
        creator: { select: { fullName: true } },
      },
    });

    // Calculate KPIs
    const totalNetRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalNewDebt = orders.reduce((sum, o) => sum + (Number(o.totalAmount || 0) - Number(o.paidAmount || 0)), 0);
    const totalOrders = orders.length;
    
    // Calculate grossRevenue and totalDiscount from invoice details
    let grossRevenue = 0;
    let totalDiscount = 0;
    let paidAmount = 0;
    
    orders.forEach((order) => {
      paidAmount += Number(order.paidAmount || 0);
      order.details.forEach((detail: any) => {
        const lineRevenue = Number(detail.price || 0) * Number(detail.quantity || 0);
        const lineDiscount = Number(detail.discountAmount || 0);
        grossRevenue += lineRevenue;
        totalDiscount += lineDiscount;
      });
    });
    
    const averageOrderValue = totalOrders > 0 ? totalNetRevenue / totalOrders : 0;
    
    const cancelledOrders = await prisma.invoice.count({
      where: { ...where, orderStatus: 'cancelled' },
    });
    const completedOrders = await prisma.invoice.count({
      where: { ...where, orderStatus: 'completed' },
    });

    // Estimated profit - Fixed: subtract discount from revenue
    let estimatedProfit = 0;
    orders.forEach((order) => {
      order.details.forEach((detail: any) => {
        const cost = Number(detail.product.basePrice || 0) * Number(detail.quantity || 0);
        const grossRevenue = Number(detail.price || 0) * Number(detail.quantity || 0);
        const discountAmount = Number(detail.discountAmount || 0);
        const netRevenue = grossRevenue - discountAmount;
        estimatedProfit += netRevenue - cost;
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
      grossRevenue,
      totalDiscount,
      netRevenue: totalNetRevenue,
      paidAmount,
      netRevenueGrowth,
      estimatedProfit,
      profitMargin,
      totalOrders,
      cancelledOrders,
      completedOrders,
      newDebt: totalNewDebt,
      totalDebt: customerId 
        ? await prisma.customer.findUnique({
            where: { id: customerId },
            select: { currentDebt: true }
          }).then(c => Number(c?.currentDebt || 0))
        : await prisma.customer.aggregate({
            _sum: { currentDebt: true },
          }).then(r => Number(r._sum.currentDebt || 0)),
      debtPercentage,
      averageOrderValue,
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
      const channel = order.isPickupOrder ? 'pickup' : 'delivery';
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
      item.netRevenue += Number(order.totalAmount || 0); // totalAmount is already net revenue
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
      
      // Fixed: Calculate actual completion rate
      const completedCount = staffOrders.filter(o => o.orderStatus === 'completed').length;
      const completionRate = item._count.id > 0 
        ? (completedCount / item._count.id) * 100 
        : 0;
      
      return {
        staffId: item.createdBy,
        staffName: user?.fullName || 'Unknown',
        avatar: user?.avatarUrl || undefined,
        totalOrders: item._count.id,
        totalRevenue: Number(item._sum.totalAmount || 0),
        paidRevenue: Number(item._sum.paidAmount || 0),
        debtAmount,
        completionRate: Math.round(completionRate * 100) / 100, // Round to 2 decimal places
      };
    });

    // 6. Top Customers
    const topCustomers = await this.getTopCustomers(10, fromDate, toDate);

    // 7. Orders list for "Chi tiết theo Đơn hàng"
    const ordersDetail = orders.map((o: any) => {
      const total = Number(o.totalAmount || 0);
      const discount = Number(o.discountAmount || 0);
      const finalAmount = total - discount; // Thành tiền = Tổng tiền - Giảm giá
      return {
        id: o.id,
        orderCode: o.orderCode,
        orderDate: o.orderDate,
        customerName: o.customer?.customerName || '—',
        staffName: o.creator?.fullName || '—',
        totalAmount: total,
        discountAmount: discount,
        finalAmount,
        paymentStatus: Number(o.paidAmount || 0) >= finalAmount ? 'paid' : Number(o.paidAmount || 0) > 0 ? 'partial' : 'unpaid',
      };
    });

    // 8. Product performance for "Chi tiết theo Sản phẩm" (from current report orders)
    const productMap = new Map<number, { productId: number; sku: string; productName: string; unit: string | null; quantity: number; revenue: number }>();
    orders.forEach((order: any) => {
      order.details.forEach((d: any) => {
        const key = d.productId;
        const rev = Number(d.price || 0) * Number(d.quantity || 0);
        if (!productMap.has(key)) {
          productMap.set(key, {
            productId: key,
            sku: d.product?.code || '',
            productName: d.product?.productName || '—',
            unit: d.product?.unit ?? null,
            quantity: 0,
            revenue: 0,
          });
        }
        const row = productMap.get(key)!;
        row.quantity += Number(d.quantity || 0);
        row.revenue += rev;
      });
    });
    const totalProductRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0);
    const productPerformance = Array.from(productMap.values())
      .map((p) => ({
        ...p,
        percentage: totalProductRevenue > 0 ? (p.revenue / totalProductRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 9. Customer analysis for "Chi tiết theo Khách hàng" (from current report orders)
    const customerMap = new Map<number, { customerId: number; customerCode: string; customerName: string; orderCount: number; totalRevenue: number; currentDebt: number }>();
    orders.forEach((order: any) => {
      const cid = order.customerId;
      const cust = order.customer;
      if (!customerMap.has(cid)) {
        customerMap.set(cid, {
          customerId: cid,
          customerCode: cust?.customerCode || '',
          customerName: cust?.customerName || '—',
          orderCount: 0,
          totalRevenue: 0,
          currentDebt: Number(cust?.currentDebt || 0),
        });
      }
      const row = customerMap.get(cid)!;
      row.orderCount += 1;
      row.totalRevenue += Number(order.totalAmount || 0);
    });
    const customerAnalysis = Array.from(customerMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

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
      orders: ordersDetail,
      productPerformance,
      customerAnalysis,
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
          status: 'posted',
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
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

    const totalReceipts = Number(receipts?._sum?.amount || 0);
    const totalPayments = Number(vouchers?._sum?.amount || 0);
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
        count: receipts?._count?.id || 0,
      },
      payments: {
        total: totalPayments,
        count: vouchers?._count?._all || 0,
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
    if (salesChannel) where.isPickupOrder = salesChannel === 'pickup';
    if (customerId) where.customerId = customerId;
    if (createdBy) where.createdBy = createdBy;

    // Get all orders
    const orders = await prisma.invoice.findMany({
      where,
      select: {
        orderDate: true,
        totalAmount: true,
        isPickupOrder: true,
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
      const channel = order.isPickupOrder ? 'pickup' : 'delivery';
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
    if (salesChannel) where.isPickupOrder = salesChannel === 'pickup';
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
        item.totalRevenue += Number(detail.price || 0) * Number(detail.quantity || 0);
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
  // NEW: API 4 - FILTER OPTIONS (Search Customer, Get Staff, Get Warehouses)
  // =====================================================
  async getFilterOptions(action: 'search-customer' | 'get-sales-staff' | 'getWarehouses', keyword?: string) {
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
    } else if (action === 'getWarehouses') {
      // Get warehouses for filter
      return await this.getWarehousesForFilter();
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

  // Export inventory report to Excel
  async exportInventoryReport(params: InventoryReportParams) {
    const ExcelJS = require('exceljs');

    // Get inventory data using existing method
    const inventoryData = await this.getInventoryReport(params);

    // Get warehouse and category names from params
    let warehouseName = 'Tất cả kho';
    let categoryName = 'Tất cả danh mục';

    if (params.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: params.warehouseId },
        select: { warehouseName: true }
      });
      warehouseName = warehouse?.warehouseName || `Kho #${params.warehouseId}`;
    }

    if (params.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: params.categoryId },
        select: { categoryName: true }
      });
      categoryName = category?.categoryName || `Danh mục #${params.categoryId}`;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Nam Viet App';
    workbook.created = new Date();

    // Sheet 1: Chi tiết tồn kho
    const sheet = workbook.addWorksheet('Chi tiết tồn kho');

    // Header style
    const headerStyle = {
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      },
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    // Add title
    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = 'BÁO CÁO TỒN KHO';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add date info
    sheet.mergeCells('A2:J2');
    sheet.getCell('A2').value = `Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')}`;
    sheet.getCell('A2').font = { size: 10, italic: true };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Add filter info
    const filterText = [
      `Kho: ${warehouseName}`,
      `Danh mục: ${categoryName}`,
      params.lowStock ? 'Chỉ hiển thị tồn thấp' : '',
    ].filter(Boolean).join(' | ');

    sheet.mergeCells('A3:J3');
    sheet.getCell('A3').value = filterText;
    sheet.getCell('A3').font = { size: 10, italic: true };
    sheet.getCell('A3').alignment = { horizontal: 'center' };

    // Headers
    const headers = ['STT', 'Mã SKU', 'Tên sản phẩm', 'Kho', 'Danh mục', 'Số lượng', 'Đơn vị', 'Đơn giá', 'Giá trị', 'Trạng thái'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    // Add data - use inventoryData.data instead of inventoryData.items
    const items = inventoryData.data || [];
    items.forEach((item: any, index: number) => {
      const row = [
        index + 1,
        item.sku,
        item.productName,
        item.warehouseName,
        item.categoryName || '',
        item.availableQuantity,
        item.unit || '',
        item.unitPrice,
        item.totalValue,
        item.isLowStock ? 'Tồn thấp' : '',
      ];
      const dataRow = sheet.addRow(row);
      
      // Style the quantity and price columns as numbers
      dataRow.getCell(6).numFmt = '#,##0';
      dataRow.getCell(8).numFmt = '#,##0 ₫';
      dataRow.getCell(9).numFmt = '#,##0 ₫';
      
      // Highlight low stock rows
      if (item.isLowStock) {
        dataRow.eachCell((cell: any) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFE699' },
          };
        });
      }
    });

    // Add summary row
    sheet.addRow([]);
    const summaryRow = sheet.addRow([
      'TỔNG CỘNG',
      '',
      '',
      '',
      '',
      inventoryData.summary?.totalQuantity || 0,
      '',
      '',
      inventoryData.summary?.totalValue || 0,
      '',
    ]);
    summaryRow.font = { bold: true };
    summaryRow.getCell(6).numFmt = '#,##0';
    summaryRow.getCell(9).numFmt = '#,##0 ₫';
    summaryRow.eachCell((cell: any) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9D9D9' },
      };
    });

    // Set column widths
    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(3).width = 30;
    sheet.getColumn(4).width = 25;
    sheet.getColumn(5).width = 20;
    sheet.getColumn(6).width = 12;
    sheet.getColumn(7).width = 12;
    sheet.getColumn(8).width = 15;
    sheet.getColumn(9).width = 15;
    sheet.getColumn(10).width = 12;

    // Sheet 2: Tổng hợp theo kho - use data to group by warehouse
    const byWarehouseMap = new Map<string, { warehouseName: string; itemCount: number; totalQuantity: number; totalValue: number }>();
    items.forEach((item: any) => {
      const wh = item.warehouseName;
      if (!byWarehouseMap.has(wh)) {
        byWarehouseMap.set(wh, { warehouseName: wh, itemCount: 0, totalQuantity: 0, totalValue: 0 });
      }
      const entry = byWarehouseMap.get(wh)!;
      entry.itemCount += 1;
      entry.totalQuantity += item.availableQuantity || 0;
      entry.totalValue += item.totalValue || 0;
    });

    if (byWarehouseMap.size > 0) {
      const warehouseSheet = workbook.addWorksheet('Tổng hợp theo kho');
      
      const whHeaders = ['STT', 'Kho', 'Số SKU', 'Tổng số lượng', 'Giá trị'];
      const whHeaderRow = warehouseSheet.addRow(whHeaders);
      whHeaderRow.eachCell((cell: any) => {
        cell.style = headerStyle;
      });

      Array.from(byWarehouseMap.values()).forEach((wh: any, index: number) => {
        const row = warehouseSheet.addRow([
          index + 1,
          wh.warehouseName,
          wh.itemCount,
          wh.totalQuantity,
          wh.totalValue,
        ]);
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0 ₫';
      });

      warehouseSheet.getColumn(1).width = 6;
      warehouseSheet.getColumn(2).width = 30;
      warehouseSheet.getColumn(3).width = 12;
      warehouseSheet.getColumn(4).width = 15;
      warehouseSheet.getColumn(5).width = 18;
    }

    // Sheet 3: Tổng hợp theo danh mục - use byCategory from inventoryData
    if (inventoryData.byCategory && inventoryData.byCategory.length > 0) {
      const categorySheet = workbook.addWorksheet('Tổng hợp theo danh mục');
      
      const catHeaders = ['STT', 'Danh mục', 'Số SKU', 'Tổng số lượng', 'Giá trị'];
      const catHeaderRow = categorySheet.addRow(catHeaders);
      catHeaderRow.eachCell((cell: any) => {
        cell.style = headerStyle;
      });

      inventoryData.byCategory.forEach((cat: any, index: number) => {
        const row = categorySheet.addRow([
          index + 1,
          cat.category || 'Chưa phân loại',
          cat.itemCount,
          cat.quantity,
          cat.value,
        ]);
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0 ₫';
      });

      categorySheet.getColumn(1).width = 6;
      categorySheet.getColumn(2).width = 30;
      categorySheet.getColumn(3).width = 12;
      categorySheet.getColumn(4).width = 15;
      categorySheet.getColumn(5).width = 18;
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // Export revenue report to Excel
  async exportRevenueReport(params: RevenueParams) {
    const ExcelJS = require('exceljs');

    // Get revenue data
    const data = await this.getRevenueReport(params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Nam Viet App';
    workbook.created = new Date();

    // Sheet 1: Tổng hợp
    const summarySheet = workbook.addWorksheet('Tổng hợp');

    // Header style
    const headerStyle = {
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      },
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    // Title
    summarySheet.mergeCells('A1:D1');
    summarySheet.getCell('A1').value = 'BÁO CÁO DOANH THU';
    summarySheet.getCell('A1').font = { bold: true, size: 14 };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };

    // Date info
    summarySheet.mergeCells('A2:D2');
    summarySheet.getCell('A2').value = `Từ ngày: ${params.fromDate || '...'} - Đến ngày: ${params.toDate || '...'}`;
    summarySheet.getCell('A2').font = { size: 10, italic: true };
    summarySheet.getCell('A2').alignment = { horizontal: 'center' };

    // KPI Summary
    const summaryHeaders = ['Chỉ tiêu', 'Giá trị', 'Đơn vị', 'Ghi chú'];
    const summaryHeaderRow = summarySheet.addRow(summaryHeaders);
    summaryHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const summary = data.summary || {};
    const summaryData = [
      ['Doanh thu tổng', summary.grossRevenue || 0, 'VND', 'Trước giảm giá'],
      ['Doanh thu thuần', summary.netRevenue || 0, 'VND', 'Sau giảm giá'],
      ['Tổng giảm giá', summary.totalDiscount || 0, 'VND', ''],
      ['Tổng đơn hàng', summary.totalOrders || 0, 'đơn', ''],
      ['Giá trị TB/đơn', summary.averageOrderValue || 0, 'VND', ''],
      ['Đã thanh toán', summary.paidAmount || 0, 'VND', ''],
      ['Công nợ', summary.debtAmount || 0, 'VND', ''],
      ['Thuế', summary.totalTax || 0, 'VND', ''],
    ];

    summaryData.forEach((row: any[]) => {
      const dataRow = summarySheet.addRow(row);
      dataRow.getCell(2).numFmt = '#,##0 ₫';
    });

    // Adjust column widths
    summarySheet.getColumn(1).width = 25;
    summarySheet.getColumn(2).width = 18;
    summarySheet.getColumn(3).width = 12;
    summarySheet.getColumn(4).width = 20;

    // Sheet 2: Chi tiết Đơn hàng
    const ordersSheet = workbook.addWorksheet('Chi tiết đơn hàng');

    const orderHeaders = ['STT', 'Mã đơn', 'Ngày bán', 'Khách hàng', 'Tổng tiền', 'Giảm giá', 'Thành tiền', 'Thanh toán', 'Trạng thái'];
    const orderHeaderRow = ordersSheet.addRow(orderHeaders);
    orderHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const orders = data.orders || [];
    orders.forEach((order: any, index: number) => {
      const statusMap: Record<string, string> = {
        paid: 'Đã thanh toán',
        partial: 'Thanh toán một phần',
        unpaid: 'Chưa thanh toán',
      };
      const row = [
        index + 1,
        order.orderCode,
        order.orderDate ? new Date(order.orderDate).toLocaleDateString('vi-VN') : '',
        order.customerName,
        order.totalAmount,
        order.discountAmount,
        order.finalAmount,
        order.paidAmount,
        statusMap[order.paymentStatus] || order.paymentStatus,
      ];
      const dataRow = ordersSheet.addRow(row);
      dataRow.getCell(5).numFmt = '#,##0 ₫';
      dataRow.getCell(6).numFmt = '#,##0 ₫';
      dataRow.getCell(7).numFmt = '#,##0 ₫';
      dataRow.getCell(8).numFmt = '#,##0 ₫';
    });

    ordersSheet.getColumn(1).width = 5;
    ordersSheet.getColumn(2).width = 18;
    ordersSheet.getColumn(3).width = 12;
    ordersSheet.getColumn(4).width = 30;
    ordersSheet.getColumn(5).width = 15;
    ordersSheet.getColumn(6).width = 12;
    ordersSheet.getColumn(7).width = 15;
    ordersSheet.getColumn(8).width = 15;
    ordersSheet.getColumn(9).width = 20;

    // Sheet 3: Chi tiết Sản phẩm
    const productsSheet = workbook.addWorksheet('Chi tiết sản phẩm');

    const productHeaders = ['STT', 'Mã SKU', 'Tên sản phẩm', 'Đơn vị', 'Số lượng', 'Doanh số', 'Tỷ trọng'];
    const productHeaderRow = productsSheet.addRow(productHeaders);
    productHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const products = data.productPerformance || [];
    products.forEach((product: any, index: number) => {
      const row = [
        index + 1,
        product.sku,
        product.productName,
        product.unit || '',
        product.quantity,
        product.revenue,
        product.percentage,
      ];
      const dataRow = productsSheet.addRow(row);
      dataRow.getCell(5).numFmt = '#,##0';
      dataRow.getCell(6).numFmt = '#,##0 ₫';
      dataRow.getCell(7).numFmt = '0.0"%"';
    });

    productsSheet.getColumn(1).width = 5;
    productsSheet.getColumn(2).width = 15;
    productsSheet.getColumn(3).width = 35;
    productsSheet.getColumn(4).width = 10;
    productsSheet.getColumn(5).width = 12;
    productsSheet.getColumn(6).width = 15;
    productsSheet.getColumn(7).width = 12;

    // Sheet 4: Chi tiết Khách hàng
    const customersSheet = workbook.addWorksheet('Chi tiết khách hàng');

    const customerHeaders = ['STT', 'Mã khách', 'Tên khách hàng', 'Số đơn', 'Tổng doanh số', 'Công nợ'];
    const customerHeaderRow = customersSheet.addRow(customerHeaders);
    customerHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const customers = data.customerAnalysis || [];
    customers.forEach((customer: any, index: number) => {
      const row = [
        index + 1,
        customer.customerCode,
        customer.customerName,
        customer.orderCount,
        customer.totalRevenue,
        customer.debt,
      ];
      const dataRow = customersSheet.addRow(row);
      dataRow.getCell(4).numFmt = '#,##0';
      dataRow.getCell(5).numFmt = '#,##0 ₫';
      dataRow.getCell(6).numFmt = '#,##0 ₫';
    });

    customersSheet.getColumn(1).width = 5;
    customersSheet.getColumn(2).width = 15;
    customersSheet.getColumn(3).width = 35;
    customersSheet.getColumn(4).width = 10;
    customersSheet.getColumn(5).width = 18;
    customersSheet.getColumn(6).width = 15;

    // Sheet 5: Theo Kênh
    const channelSheet = workbook.addWorksheet('Theo kênh bán hàng');

    const channelHeaders = ['STT', 'Kênh bán hàng', 'Số đơn', 'Doanh thu'];
    const channelHeaderRow = channelSheet.addRow(channelHeaders);
    channelHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const channels = data.byChannel || [];
    channels.forEach((channel: any, index: number) => {
      const row = [
        index + 1,
        channel.channelName || channel.channel,
        channel.orderCount,
        channel.revenue,
      ];
      const dataRow = channelSheet.addRow(row);
      dataRow.getCell(3).numFmt = '#,##0';
      dataRow.getCell(4).numFmt = '#,##0 ₫';
    });

    channelSheet.getColumn(1).width = 5;
    channelSheet.getColumn(2).width = 25;
    channelSheet.getColumn(3).width = 12;
    channelSheet.getColumn(4).width = 18;

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

export default new ReportService();
