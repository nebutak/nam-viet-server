import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class FinancialService {
  /**
   * Get comprehensive financial report
   */
  async getFinancialReport(fromDate: string, toDate: string): Promise<any> {
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);

    // Calculate previous period for growth comparison
    const periodDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevEndDate = new Date(startDate.getTime() - 1);

    // Fetch KPI data
    const kpi = await this.getKPI(startDate, endDate, prevStartDate, prevEndDate);
    const profitLoss = await this.getProfitLoss(startDate, endDate, prevStartDate, prevEndDate);
    const cashLedger = await this.getCashLedger(startDate, endDate);
    const receiptsByType = await this.getReceiptsByType(startDate, endDate);
    const paymentsByType = await this.getPaymentsByType(startDate, endDate);
    const paymentMethods = await this.getPaymentMethods(startDate, endDate);
    const cashBookEntries = await this.getCashBookEntries(startDate, endDate);
    const customerDebts = await this.getCustomerDebts(startDate, endDate);
    const supplierDebts = await this.getSupplierDebts(startDate, endDate);

    return {
      period: {
        fromDate: startDate.toISOString().split('T')[0],
        toDate: endDate.toISOString().split('T')[0],
        days: periodDays,
      },
      kpi,
      profitLoss,
      cashLedger,
      receiptsByType,
      paymentsByType,
      paymentMethods,
      cashBookEntries,
      customerDebts,
      supplierDebts,
    };
  }

  /**
   * Calculate KPI metrics
   */
  private async getKPI(
    startDate: Date,
    endDate: Date,
    prevStartDate: Date,
    prevEndDate: Date
  ): Promise<any> {
    // Current period
    const currentReceipts = await prisma.paymentReceipt.aggregate({
      _sum: { amount: true },
      where: {
        receiptDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const currentPayments = await prisma.paymentVoucher.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Previous period
    const prevReceipts = await prisma.paymentReceipt.aggregate({
      _sum: { amount: true },
      where: {
        receiptDate: {
          gte: prevStartDate,
          lte: prevEndDate,
        },
      },
    });

    const prevPayments = await prisma.paymentVoucher.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: {
          gte: prevStartDate,
          lte: prevEndDate,
        },
      },
    });

    const totalReceipts = Number(currentReceipts._sum.amount || 0);
    const totalPayments = Number(currentPayments._sum.amount || 0);
    const prevTotalReceipts = Number(prevReceipts._sum.amount || 0);
    const prevTotalPayments = Number(prevPayments._sum.amount || 0);

    // Get latest cash fund balance
    const latestCashFund = await prisma.cashFund.findFirst({
      where: { fundDate: { lte: endDate } },
      orderBy: { fundDate: 'desc' },
    });

    const openingBalance = Number(latestCashFund?.openingBalance || 0);
    const closingBalance = Number(latestCashFund?.closingBalance || openingBalance);

    // Calculate growth percentages
    const receiptGrowth = prevTotalReceipts > 0 ? ((totalReceipts - prevTotalReceipts) / prevTotalReceipts) * 100 : 0;
    const paymentGrowth = prevTotalPayments > 0 ? ((totalPayments - prevTotalPayments) / prevTotalPayments) * 100 : 0;
    const netCashFlow = totalReceipts - totalPayments;
    const prevNetCashFlow = prevTotalReceipts - prevTotalPayments;
    const cashFlowGrowth = prevNetCashFlow > 0 ? ((netCashFlow - prevNetCashFlow) / prevNetCashFlow) * 100 : 0;

    return {
      totalReceipts,
      totalPayments,
      netCashFlow,
      openingBalance,
      closingBalance,
      receiptGrowth,
      paymentGrowth,
      cashFlowGrowth,
    };
  }

  /**
   * Get P&L statement
   */
  private async getProfitLoss(
    startDate: Date,
    endDate: Date,
    prevStartDate: Date,
    prevEndDate: Date
  ): Promise<any> {
    // Revenue from sales orders - use totalAmount instead of finalAmount
    const currentRevenue = await prisma.invoice.aggregate({
      _sum: { totalAmount: true },
      where: {
        orderDate: {
          gte: startDate,
          lte: endDate,
        },
        orderStatus: 'completed',
      },
    });

    const prevRevenue = await prisma.invoice.aggregate({
      _sum: { totalAmount: true },
      where: {
        orderDate: {
          gte: prevStartDate,
          lte: prevEndDate,
        },
        orderStatus: 'completed',
      },
    });

    const totalRevenue = Number(currentRevenue._sum.totalAmount || 0);
    const prevTotalRevenue = Number(prevRevenue._sum.totalAmount || 0);

    // Discounts
    const currentDiscounts = await prisma.invoice.aggregate({
      _sum: { discountAmount: true },
      where: {
        orderDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const prevDiscounts = await prisma.invoice.aggregate({
      _sum: { discountAmount: true },
      where: {
        orderDate: {
          gte: prevStartDate,
          lte: prevEndDate,
        },
      },
    });

    const discounts = Number(currentDiscounts._sum.discountAmount || 0);
    const prevDiscounts_val = Number(prevDiscounts._sum.discountAmount || 0);

    // Net revenue
    const netRevenue = totalRevenue - discounts;
    const prevNetRevenue = prevTotalRevenue - prevDiscounts_val;

    // Expenses (COGS + Operating expenses)
    const currentExpenses = await prisma.paymentVoucher.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const prevExpenses = await prisma.paymentVoucher.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: {
          gte: prevStartDate,
          lte: prevEndDate,
        },
      },
    });

    const totalExpenses = Number(currentExpenses._sum.amount || 0);
    const prevTotalExpenses = Number(prevExpenses._sum.amount || 0);

    const netProfit = netRevenue - totalExpenses;
    const prevNetProfit = prevNetRevenue - prevTotalExpenses;

    // Build P&L lines
    const lines = [
      {
        key: 'revenue',
        label: '(+) Doanh thu bán hàng',
        currentPeriod: totalRevenue,
        previousPeriod: prevTotalRevenue,
        growth: prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0,
        type: 'revenue' as const,
      },
      {
        key: 'discount',
        label: '(-) Giảm giá/Chiết khấu',
        currentPeriod: discounts,
        previousPeriod: prevDiscounts_val,
        growth: prevDiscounts_val > 0 ? ((discounts - prevDiscounts_val) / prevDiscounts_val) * 100 : 0,
        type: 'expense' as const,
      },
      {
        key: 'netRevenue',
        label: '(=) Doanh thu thuần',
        currentPeriod: netRevenue,
        previousPeriod: prevNetRevenue,
        growth: prevNetRevenue > 0 ? ((netRevenue - prevNetRevenue) / prevNetRevenue) * 100 : 0,
        type: 'subtotal' as const,
      },
      {
        key: 'expenses',
        label: '(-) Chi phí vận hành',
        currentPeriod: totalExpenses,
        previousPeriod: prevTotalExpenses,
        growth: prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : 0,
        type: 'expense' as const,
      },
      {
        key: 'netProfit',
        label: '(=) Lợi nhuận',
        currentPeriod: netProfit,
        previousPeriod: prevNetProfit,
        growth: prevNetProfit > 0 ? ((netProfit - prevNetProfit) / prevNetProfit) * 100 : 0,
        type: 'profit' as const,
      },
    ];

    return {
      lines,
      totalRevenue,
      totalExpenses,
      netProfit,
    };
  }

  /**
   * Get daily cash ledger
   */
  private async getCashLedger(startDate: Date, endDate: Date): Promise<any[]> {
    const cashFunds = await prisma.cashFund.findMany({
      where: {
        fundDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { fundDate: 'asc' },
    });

    const ledger: any[] = [];

    for (const cf of cashFunds) {
      // Count receipts and payments for this day
      const receiptCount = await prisma.paymentReceipt.count({
        where: {
          receiptDate: cf.fundDate,
        },
      });

      const paymentCount = await prisma.paymentVoucher.count({
        where: {
          paymentDate: cf.fundDate,
        },
      });

      ledger.push({
        date: cf.fundDate.toISOString().split('T')[0],
        openingBalance: Number(cf.openingBalance),
        totalReceipts: Number(cf.totalReceipts || 0),
        totalPayments: Number(cf.totalPayments || 0),
        closingBalance: Number(cf.closingBalance),
        receiptCount,
        paymentCount,
      });
    }

    return ledger;
  }

  /**
   * Get receipts breakdown by type
   */
  private async getReceiptsByType(startDate: Date, endDate: Date): Promise<any[]> {
    const receipts = await prisma.paymentReceipt.groupBy({
      by: ['receiptType'],
      _sum: { amount: true },
      _count: true,
      where: {
        receiptDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totalReceipts = receipts.reduce((sum, r) => sum + Number(r._sum.amount || 0), 0);

    return receipts.map((r) => ({
      type: r.receiptType,
      displayName: this.getReceiptTypeName(r.receiptType),
      amount: Number(r._sum.amount || 0),
      percentage: totalReceipts > 0 ? (Number(r._sum.amount || 0) / totalReceipts) * 100 : 0,
      count: r._count,
    }));
  }

  /**
   * Get payments breakdown by type
   */
  private async getPaymentsByType(startDate: Date, endDate: Date): Promise<any[]> {
    const payments = await prisma.paymentVoucher.groupBy({
      by: ['voucherType'],
      _sum: { amount: true },
      _count: true,
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totalPayments = payments.reduce((sum, p) => sum + Number(p._sum.amount || 0), 0);

    return payments.map((p) => ({
      type: p.voucherType,
      displayName: this.getVoucherTypeName(p.voucherType),
      amount: Number(p._sum.amount || 0),
      percentage: totalPayments > 0 ? (Number(p._sum.amount || 0) / totalPayments) * 100 : 0,
      count: p._count,
    }));
  }

  /**
   * Get payment methods breakdown
   */
  private async getPaymentMethods(startDate: Date, endDate: Date) {
    const payments = await prisma.paymentVoucher.groupBy({
      by: ['paymentMethod'],
      _sum: { amount: true },
      _count: true,
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totalPayments = payments.reduce((sum, p) => sum + Number(p._sum.amount || 0), 0);

    return payments.map((p) => ({
      paymentMethod: p.paymentMethod,
      displayName: p.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản',
      amount: Number(p._sum.amount || 0),
      percentage: totalPayments > 0 ? (Number(p._sum.amount || 0) / totalPayments) * 100 : 0,
      count: p._count,
    }));
  }

  /**
   * Get detailed cash book entries
   */
  private async getCashBookEntries(startDate: Date, endDate: Date): Promise<any[]> {
    const entries: any[] = [];

    // Get receipts
    const receipts = await prisma.paymentReceipt.findMany({
      where: {
        receiptDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        creator: true,
        customerRef: true,
      },
    });

    receipts.forEach((r) => {
      entries.push({
        id: r.id,
        date: r.receiptDate.toISOString().split('T')[0],
        code: r.receiptCode,
        type: 'receipt',
        description: `Thu tiền từ khách hàng`,
        party: r.customerRef?.customerName || 'N/A',
        amount: Number(r.amount),
        paymentMethod: this.getPaymentMethodName(r.paymentMethod as any),
        createdBy: r.creator?.fullName || 'N/A',
        status: 'completed',
      });
    });

    // Get vouchers
    const vouchers = await prisma.paymentVoucher.findMany({
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        creator: true,
        supplier: true,
      },
    });

    vouchers.forEach((v) => {
      entries.push({
        id: v.id + 10000,
        date: v.paymentDate.toISOString().split('T')[0],
        code: v.voucherCode,
        type: 'payment',
        description: this.getVoucherTypeName(v.voucherType),
        party: v.supplier?.supplierName || 'N/A',
        amount: Number(v.amount),
        paymentMethod: this.getVoucherPaymentMethodName(v.paymentMethod),
        createdBy: v.creator?.fullName || 'N/A',
        status: 'completed',
      });
    });

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Get customer debts
   */
  private async getCustomerDebts(startDate: Date, endDate: Date): Promise<any[]> {
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        classification: true,
        currentDebt: true,
        debtUpdatedAt: true,
      },
    });

    const debts: any[] = [];

    for (const customer of customers) {
      // Get transactions in period
      const sales = await prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: {
          customerId: customer.id,
          orderDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      const payments = await prisma.paymentReceipt.aggregate({
        _sum: { amount: true },
        where: {
          customerId: customer.id,
          receiptDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      const newDebt = Number(sales._sum.totalAmount || 0) - Number(payments._sum.amount || 0);

      // Check if overdue
      const daysOverdue = customer.debtUpdatedAt
        ? Math.floor((new Date().getTime() - new Date(customer.debtUpdatedAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const closingDebt = Number(customer.currentDebt || 0);

      debts.push({
        customerId: customer.id,
        customerCode: customer.customerCode,
        customerName: customer.customerName,
        classification: customer.classification,
        openingDebt: closingDebt - newDebt,
        newDebt,
        payments: Number(payments._sum.amount || 0),
        closingDebt,
        overdue: daysOverdue > 30 && closingDebt > 0,
        daysOverdue: daysOverdue > 0 ? daysOverdue : undefined,
      });
    }

    return debts.filter((d) => d.closingDebt > 0);
  }

  /**
   * Get supplier debts
   */
  private async getSupplierDebts(startDate: Date, endDate: Date): Promise<any[]> {
    const suppliers = await prisma.supplier.findMany({
      select: {
        id: true,
        supplierCode: true,
        supplierName: true,
        supplierType: true,
        totalPayable: true,
        payableUpdatedAt: true,
      },
    });

    const debts: any[] = [];

    for (const supplier of suppliers) {
      // Get purchases in period
      const purchases = await prisma.purchaseOrder.aggregate({
        _sum: { totalAmount: true },
        where: {
          supplierId: supplier.id,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Get payments in period
      const payments = await prisma.paymentVoucher.aggregate({
        _sum: { amount: true },
        where: {
          supplierId: supplier.id,
          paymentDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      const daysOverdue = supplier.payableUpdatedAt
        ? Math.floor((new Date().getTime() - new Date(supplier.payableUpdatedAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const closingPayable = Number(supplier.totalPayable || 0);

      debts.push({
        supplierId: supplier.id,
        supplierCode: supplier.supplierCode,
        supplierName: supplier.supplierName,
        supplierType: supplier.supplierType,
        openingPayable: closingPayable - Number(purchases._sum.totalAmount || 0),
        purchasesInPeriod: Number(purchases._sum.totalAmount || 0),
        paymentsMade: Number(payments._sum.amount || 0),
        closingPayable,
        overdue: daysOverdue > 30 && closingPayable > 0,
        daysOverdue: daysOverdue > 0 ? daysOverdue : undefined,
      });
    }

    return debts.filter((d) => d.closingPayable > 0);
  }

  // Helper methods
  private getReceiptTypeName(type: string): string {
    const names: Record<string, string> = {
      sales: 'Thu bán hàng',
      debt_collection: 'Thu công nợ',
      refund: 'Hoàn tiền',
      other: 'Khác',
    };
    return names[type] || type;
  }

  private getVoucherTypeName(type: string): string {
    const names: Record<string, string> = {
      salary: 'Trả lương',
      operating_cost: 'Chi phí vận hành',
      supplier_payment: 'Trả NCC',
      refund: 'Hoàn tiền',
      other: 'Khác',
    };
    return names[type] || type;
  }

  private getPaymentMethodName(method: string): string {
    const names: Record<string, string> = {
      cash: 'Tiền mặt',
      transfer: 'Chuyển khoản',
      card: 'Thẻ',
    };
    return names[method] || method;
  }

  private getVoucherPaymentMethodName(method: string): string {
    const names: Record<string, string> = {
      cash: 'Tiền mặt',
      transfer: 'Chuyển khoản',
    };
    return names[method] || method;
  }
}

export default new FinancialService();
