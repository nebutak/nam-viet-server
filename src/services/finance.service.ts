import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

class FinanceService {
  /**
   * 1. TỔNG QUAN (OVERVIEW/SUMMARY)
   */

  async getFinanceSummary(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate previous period for growth comparison
    const periodDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(start.getTime() - 1);

    // 1. Doanh thu thuần (completed orders)
    const currentRevenue = await prisma.invoice.aggregate({
      _sum: { totalAmount: true },
      where: {
        orderDate: { gte: start, lte: end },
        orderStatus: 'completed',
      },
    });

    const prevRevenue = await prisma.invoice.aggregate({
      _sum: { totalAmount: true },
      where: {
        orderDate: { gte: prevStart, lte: prevEnd },
        orderStatus: 'completed',
      },
    });

    const revenue = Number(currentRevenue._sum?.totalAmount || 0);
    const prevRevenueVal = Number(prevRevenue._sum?.totalAmount || 0);
    const revenueGrowth = prevRevenueVal > 0 ? ((revenue - prevRevenueVal) / prevRevenueVal) * 100 : 0;

    // 2. Tổng chi phí (Operating expenses from PaymentVoucher)
    const currentExpenses = await prisma.paymentVoucher.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: { gte: start, lte: end },
        isPosted: true,
        voucherType: { not: 'refund' },
      },
    });

    const prevExpenses = await prisma.paymentVoucher.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: { gte: prevStart, lte: prevEnd },
        isPosted: true,
        voucherType: { not: 'refund' },
      },
    });

    const expenses = Number(currentExpenses._sum.amount || 0);
    const prevExpensesVal = Number(prevExpenses._sum.amount || 0);

    // 3. COGS (Cost of goods sold from StockTransaction)
    const currentCogs = await prisma.stockTransaction.aggregate({
      _sum: { totalValue: true },
      where: {
        createdAt: { gte: start, lte: end },
        transactionType: 'export',
        referenceType: 'invoice',
      },
    });

    const prevCogs = await prisma.stockTransaction.aggregate({
      _sum: { totalValue: true },
      where: {
        createdAt: { gte: prevStart, lte: prevEnd },
        transactionType: 'export',
        referenceType: 'invoice',
      },
    });

    const cogs = Number(currentCogs._sum?.totalValue || 0);
    const prevCogsVal = Number(prevCogs._sum?.totalValue || 0);

    // 4. Total expenses = operating expenses + COGS
    const totalExpenses = expenses + cogs;
    const prevTotalExpenses = prevExpensesVal + prevCogsVal;
    const totalExpensesGrowth = prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : 0;

    // 5. Lợi nhuận gộp (Gross Profit)
    const grossProfit = revenue - totalExpenses;
    const prevGrossProfit = prevRevenueVal - prevTotalExpenses;
    const grossProfitGrowth = prevGrossProfit > 0 ? ((grossProfit - prevGrossProfit) / prevGrossProfit) * 100 : 0;

    // 6. Tồn quỹ hiện tại (Current Cash Balance)
    const latestCashFund = await prisma.cashFund.findFirst({
      where: { fundDate: { lte: end } },
      orderBy: { fundDate: 'desc' },
    });

    const closingBalance = Number(latestCashFund?.closingBalance || 0);

    // If today not yet closed, calculate: previousBalance + today's receipts - today's payments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let adjustedBalance = closingBalance;
    if (!latestCashFund || latestCashFund.fundDate < today) {
      const todayReceipts = await prisma.paymentReceipt.aggregate({
        _sum: { amount: true },
        where: { receiptDate: { gte: today } },
      });
      
      const todayPayments = await prisma.paymentVoucher.aggregate({
        _sum: { amount: true },
        where: { paymentDate: { gte: today } },
      });

      adjustedBalance = closingBalance + Number(todayReceipts._sum.amount || 0) - Number(todayPayments._sum.amount || 0);
    }

    return {
      period: {
        fromDate: startDate,
        toDate: endDate,
      },
      summary: {
        totalReceipts: revenue,
        totalReceipts_previous: prevRevenueVal,
        totalReceipts_growth: revenueGrowth,
        totalExpenses,
        totalExpenses_previous: prevTotalExpenses,
        totalExpenses_growth: totalExpensesGrowth,
        grossProfit,
        grossProfit_previous: prevGrossProfit,
        grossProfit_growth: grossProfitGrowth,
        closingBalance: adjustedBalance,
        lastClosedDate: latestCashFund?.fundDate || null,
      },
    };
  }

  /**
   * 2. BIỂU ĐỒ (CHARTS DATA)
   */

  async getCashFlowChart(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Group receipts by date
    const receipts = await prisma.paymentReceipt.groupBy({
      by: ['receiptDate'],
      _sum: { amount: true },
      where: {
        receiptDate: { gte: start, lte: end },
      },
      orderBy: { receiptDate: 'asc' },
    });

    // Group payments by date
    const payments = await prisma.paymentVoucher.groupBy({
      by: ['paymentDate'],
      _sum: { amount: true },
      where: {
        paymentDate: { gte: start, lte: end },
      },
      orderBy: { paymentDate: 'asc' },
    });

    // Create a map of dates
    const dateMap = new Map<string, { income: number; expense: number }>();

    // Process receipts
    receipts.forEach((r) => {
      const dateStr = r.receiptDate.toISOString().split('T')[0];
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { income: 0, expense: 0 });
      }
      const current = dateMap.get(dateStr)!;
      current.income += Number(r._sum.amount || 0);
    });

    // Process payments
    payments.forEach((p) => {
      const dateStr = p.paymentDate.toISOString().split('T')[0];
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { income: 0, expense: 0 });
      }
      const current = dateMap.get(dateStr)!;
      current.expense += Number(p._sum.amount || 0);
    });

    // Convert to array
    const result = Array.from(dateMap.entries())
      .map(([date, data]) => ({
        date,
        income: data.income,
        expense: data.expense,
        netCashFlow: data.income - data.expense,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return result;
  }

  async getExpenseStructureChart(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const expenses = await prisma.paymentVoucher.groupBy({
      by: ['voucherType'],
      _sum: { amount: true },
      _count: true,
      where: {
        paymentDate: { gte: start, lte: end },
        isPosted: true,
        voucherType: { not: 'refund' },
      },
    });

    const total = expenses.reduce((sum, e) => sum + Number(e._sum.amount || 0), 0);

    return expenses.map((e) => ({
      type: e.voucherType,
      displayName: this.getVoucherTypeName(e.voucherType),
      amount: Number(e._sum.amount || 0),
      percentage: total > 0 ? (Number(e._sum.amount || 0) / total) * 100 : 0,
      count: e._count,
    }));
  }

  /**
   * 3. BÁO CÁO CHI TIẾT (DETAILED REPORTS)
   */

  async getPnlReport(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Revenue
    const revenueResult = await prisma.invoice.aggregate({
      _sum: { totalAmount: true },
      where: {
        orderDate: { gte: start, lte: end },
        orderStatus: 'completed',
      },
    });
    const revenue = Number(revenueResult._sum?.totalAmount || 0);

    // Deductions (discount)
    const deductionsResult = await prisma.invoice.aggregate({
      _sum: { discountAmount: true },
      where: {
        orderDate: { gte: start, lte: end },
      },
    });
    const deductions = Number(deductionsResult._sum?.discountAmount || 0);

    // Net revenue
    const netRevenue = revenue - deductions;

    // COGS
    const cogsResult = await prisma.stockTransaction.aggregate({
      _sum: { totalValue: true },
      where: {
        createdAt: { gte: start, lte: end },
        transactionType: 'export',
        referenceType: 'invoice',
      },
    });
    const cogs = Number(cogsResult._sum?.totalValue || 0);

    // Gross profit
    const grossProfit = netRevenue - cogs;

    // Operating expenses by type
    const expensesByType = await prisma.paymentVoucher.groupBy({
      by: ['voucherType'],
      _sum: { amount: true },
      where: {
        paymentDate: { gte: start, lte: end },
        isPosted: true,
        voucherType: { not: 'refund' },
      },
    });

    const totalExpenses = expensesByType.reduce((sum, e) => sum + Number(e._sum.amount || 0), 0);

    // Net profit
    const netProfit = grossProfit - totalExpenses;

    return {
      period: { fromDate: startDate, toDate: endDate },
      details: {
        revenue: {
          label: '(+) Doanh thu bán hàng',
          amount: revenue,
        },
        deductions: {
          label: '(-) Giảm giá/Chiết khấu',
          amount: deductions,
        },
        netRevenue: {
          label: '(=) Doanh thu thuần',
          amount: netRevenue,
        },
        cogs: {
          label: '(-) Giá vốn hàng bán',
          amount: cogs,
        },
        grossProfit: {
          label: '(=) Lợi nhuận gộp',
          amount: grossProfit,
        },
        expenses: expensesByType.map((e) => ({
          label: `(-) ${this.getVoucherTypeName(e.voucherType)}`,
          amount: Number(e._sum.amount || 0),
        })),
        totalExpenses: {
          label: '(-) Tổng chi phí',
          amount: totalExpenses,
        },
        netProfit: {
          label: '(=) Lợi nhuận ròng',
          amount: netProfit,
        },
      },
    };
  }

  async getCashBook(startDate: string, endDate: string, page: number = 1, limit: number = 20) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const skip = (page - 1) * limit;

    // Get receipts
    const receipts = await prisma.paymentReceipt.findMany({
      where: {
        receiptDate: { gte: start, lte: end },
      },
      include: {
        customerRef: true,
        creator: true,
      },
      orderBy: { receiptDate: 'desc' },
    });

    // Get vouchers
    const vouchers = await prisma.paymentVoucher.findMany({
      where: {
        paymentDate: { gte: start, lte: end },
      },
      include: {
        supplier: true,
        creator: true,
      },
      orderBy: { paymentDate: 'desc' },
    });

    // Merge and map
    const entries = [
      ...receipts.map((r) => ({
        id: `receipt_${r.id}`,
        date: r.receiptDate.toISOString().split('T')[0],
        code: r.receiptCode,
        type: 'IN',
        typeLabel: 'Thu',
        description: `Thu tiền từ ${r.customerRef?.customerName || 'Khách hàng'}`,
        party: r.customerRef?.customerName || 'N/A',
        amount: Number(r.amount),
        paymentMethod: r.paymentMethod,
        createdBy: r.creator?.fullName || 'N/A',
        isPosted: true,
      })),
      ...vouchers.map((v) => ({
        id: `voucher_${v.id}`,
        date: v.paymentDate.toISOString().split('T')[0],
        code: v.voucherCode,
        type: 'OUT',
        typeLabel: 'Chi',
        description: `${this.getVoucherTypeName(v.voucherType)}${v.supplier ? ` cho ${v.supplier.supplierName}` : ''}`,
        party: v.supplier?.supplierName || 'Nội bộ',
        amount: Number(v.amount),
        paymentMethod: v.paymentMethod,
        createdBy: v.creator?.fullName || 'N/A',
        isPosted: v.isPosted,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = entries.length;
    const paginatedEntries = entries.slice(skip, skip + limit);

    // Calculate running balance
    let balance = 0;
    const cashFund = await prisma.cashFund.findFirst({
      where: { fundDate: { lt: start } },
      orderBy: { fundDate: 'desc' },
    });
    balance = Number(cashFund?.closingBalance || 0);

    const withBalance = paginatedEntries.reverse().map((entry) => {
      if (entry.type === 'IN') {
        balance += entry.amount;
      } else {
        balance -= entry.amount;
      }
      return { ...entry, balance };
    });

    return {
      period: { fromDate: startDate, toDate: endDate },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      entries: withBalance.reverse(),
    };
  }

  async getDebts(type: 'customer' | 'supplier', status: 'all' | 'overdue' = 'all') {
    if (type === 'customer') {
      const customers = await prisma.customer.findMany({
        where: {
          currentDebt: { gt: 0 },
        },
        select: {
          id: true,
          customerCode: true,
          customerName: true,
          classification: true,
          currentDebt: true,
          creditLimit: true,
          debtUpdatedAt: true,
        },
      });

      const result = customers.map((c) => {
        const daysOverdue = c.debtUpdatedAt
          ? Math.floor((new Date().getTime() - new Date(c.debtUpdatedAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          code: c.customerCode,
          name: c.customerName,
          classification: c.classification,
          debt: Number(c.currentDebt || 0),
          creditLimit: Number(c.creditLimit || 0),
          overdue: daysOverdue > 30,
          daysOverdue: daysOverdue > 30 ? daysOverdue : 0,
          lastUpdate: c.debtUpdatedAt,
        };
      });

      if (status === 'overdue') {
        return result.filter((r) => r.overdue);
      }
      return result;
    } else {
      const suppliers = await prisma.supplier.findMany({
        where: {
          totalPayable: { gt: 0 },
        },
        select: {
          id: true,
          supplierCode: true,
          supplierName: true,
          supplierType: true,
          totalPayable: true,
          payableUpdatedAt: true,
        },
      });

      const result = suppliers.map((s) => {
        const daysOverdue = s.payableUpdatedAt
          ? Math.floor((new Date().getTime() - new Date(s.payableUpdatedAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          code: s.supplierCode,
          name: s.supplierName,
          type: s.supplierType,
          payable: Number(s.totalPayable || 0),
          overdue: daysOverdue > 30,
          daysOverdue: daysOverdue > 30 ? daysOverdue : 0,
          lastUpdate: s.payableUpdatedAt,
        };
      });

      if (status === 'overdue') {
        return result.filter((r) => r.overdue);
      }
      return result;
    }
  }

  /**
   * 4. HÀNH ĐỘNG (ACTIONS)
   */

  async closeCashFund(fundDate: string, notes: string = '') {
    const date = new Date(fundDate);

    // Check if already closed
    const existing = await prisma.cashFund.findUnique({
      where: { fundDate: date },
    });

    if (existing?.isLocked) {
      throw new Error('Ngày này đã được chốt sổ rồi!');
    }

    // Get opening balance from previous day
    const previousFund = await prisma.cashFund.findFirst({
      where: { fundDate: { lt: date } },
      orderBy: { fundDate: 'desc' },
    });

    const openingBalance = Number(previousFund?.closingBalance || 0);

    // Calculate receipts today
    const receiptsToday = await prisma.paymentReceipt.aggregate({
      _sum: { amount: true },
      where: {
        receiptDate: date,
      },
    });

    const totalReceipts = Number(receiptsToday._sum.amount || 0);

    // Calculate payments today
    const paymentsToday = await prisma.paymentVoucher.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: date,
      },
    });

    const totalPayments = Number(paymentsToday._sum.amount || 0);

    // Calculate closing balance
    const closingBalance = openingBalance + totalReceipts - totalPayments;

    // Upsert cash fund
    const result = await prisma.cashFund.upsert({
      where: { fundDate: date },
      update: {
        openingBalance: new Decimal(openingBalance),
        totalReceipts: new Decimal(totalReceipts),
        totalPayments: new Decimal(totalPayments),
        closingBalance: new Decimal(closingBalance),
        isLocked: true,
        notes,
      },
      create: {
        fundDate: date,
        openingBalance: new Decimal(openingBalance),
        totalReceipts: new Decimal(totalReceipts),
        totalPayments: new Decimal(totalPayments),
        closingBalance: new Decimal(closingBalance),
        isLocked: true,
        notes,
      },
    });

    // Log activity
    // TODO: Log to ActivityLog table

    return {
      success: true,
      message: `Đã chốt sổ quỹ ngày ${fundDate}`,
      data: {
        fundDate: result.fundDate.toISOString().split('T')[0],
        openingBalance: Number(result.openingBalance),
        totalReceipts: Number(result.totalReceipts),
        totalPayments: Number(result.totalPayments),
        closingBalance: Number(result.closingBalance),
      },
    };
  }

  async remindDebts(customerIds: number[], message: string = '') {
    // Get admin user to assign notifications to
    const adminUser = await prisma.user.findFirst({
      where: { role: { roleKey: 'admin' } },
      select: { id: true },
    });

    if (!adminUser) {
      throw new Error('No admin user found to assign notifications');
    }

    // Create notifications for each customer
    const notifications = await Promise.all(
      customerIds.map((_customerId) =>
        prisma.notification.create({
          data: {
            notificationType: 'debt_overdue',
            title: 'Nhắc nợ',
            message: message || 'Bạn có công nợ quá hạn, vui lòng thanh toán',
            isRead: false,
            userId: adminUser.id,
          },
        })
      )
    );

    return {
      success: true,
      message: `Đã gửi nhắc nợ cho ${customerIds.length} khách hàng`,
      data: { notificationCount: notifications.length },
    };
  }

  // Helper methods
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
}

export default new FinanceService();
