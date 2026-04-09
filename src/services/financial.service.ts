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
    const topCustomers = await this.getTopCustomers(startDate, endDate);
    const topSuppliers = await this.getTopSuppliers(startDate, endDate);

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
      topCustomers,
      topSuppliers,
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

    // Get latest cash fund balance - ĐÃ LOẠI BỎ THEO YÊU CẦU
    /*
    const latestCashFund = await prisma.cashFund.findFirst({
      where: { fundDate: { lte: endDate } },
      orderBy: { fundDate: 'desc' },
    });
    */

    const openingBalance = 0; // legacy: latestCashFund?.openingBalance || 0
    const closingBalance = 0; // legacy: latestCashFund?.closingBalance || openingBalance


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
  private async getCashLedger(_startDate: Date, _endDate: Date): Promise<any[]> {
    /*
    const cashFunds = await prisma.cashFund.findMany({
      where: {
        fundDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { fundDate: 'asc' },
    });
    */
    const cashFunds: any[] = [];


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

  /**
   * Get top customers by payment amount
   */
  async getTopCustomers(startDate: Date, endDate: Date, limit: number = 5): Promise<any[]> {
    const receipts = await prisma.paymentReceipt.findMany({
      where: {
        receiptDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        customerRef: {
          select: {
            id: true,
            customerCode: true,
            customerName: true,
          },
        },
      },
      orderBy: {
        amount: 'desc',
      },
      take: limit,
    });

    // Group by customer and sum
    const customerMap = new Map<number, any>();
    for (const receipt of receipts) {
      if (!receipt.customerRef) continue;
      const cid = receipt.customerRef.id;
      if (!customerMap.has(cid)) {
        customerMap.set(cid, {
          customerId: cid,
          customerCode: receipt.customerRef.customerCode,
          customerName: receipt.customerRef.customerName,
          totalAmount: 0,
          transactionCount: 0,
        });
      }
      const existing = customerMap.get(cid)!;
      existing.totalAmount += Number(receipt.amount);
      existing.transactionCount += 1;
    }

    return Array.from(customerMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit);
  }

  /**
   * Get top suppliers by payment amount
   */
  async getTopSuppliers(startDate: Date, endDate: Date, limit: number = 5): Promise<any[]> {
    const vouchers = await prisma.paymentVoucher.findMany({
      where: {
        supplierId: { not: null },
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        supplier: {
          select: {
            id: true,
            supplierCode: true,
            supplierName: true,
            supplierType: true,
          },
        },
      },
      orderBy: {
        amount: 'desc',
      },
      take: limit * 2, // Get more to filter
    });

    // Group by supplier and sum
    const supplierMap = new Map<number, any>();
    for (const voucher of vouchers) {
      if (!voucher.supplier) continue;
      const sid = voucher.supplier.id;
      if (!supplierMap.has(sid)) {
        supplierMap.set(sid, {
          supplierId: sid,
          supplierCode: voucher.supplier.supplierCode,
          supplierName: voucher.supplier.supplierName,
          supplierType: voucher.supplier.supplierType,
          totalAmount: 0,
          transactionCount: 0,
        });
      }
      const existing = supplierMap.get(sid)!;
      existing.totalAmount += Number(voucher.amount);
      existing.transactionCount += 1;
    }

    return Array.from(supplierMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit);
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

  /**
   * Export financial report to Excel
   */
  async exportFinancialReport(fromDate: string, toDate: string): Promise<Buffer> {
    const ExcelJS = require('exceljs');

    // Get financial data
    const data = await this.getFinancialReport(fromDate, toDate);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Nam Viet App';
    workbook.created = new Date();

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

    // Sheet 1: Tổng hợp
    const summarySheet = workbook.addWorksheet('Tổng hợp');

    // Title
    summarySheet.mergeCells('A1:D1');
    summarySheet.getCell('A1').value = 'BÁO CÁO TÀI CHÍNH';
    summarySheet.getCell('A1').font = { bold: true, size: 14 };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };

    // Date info
    summarySheet.mergeCells('A2:D2');
    summarySheet.getCell('A2').value = `Từ ngày: ${fromDate} - Đến ngày: ${toDate}`;
    summarySheet.getCell('A2').font = { size: 10, italic: true };
    summarySheet.getCell('A2').alignment = { horizontal: 'center' };

    // KPI Summary
    const summaryHeaders = ['Chỉ tiêu', 'Giá trị', 'Đơn vị', 'Ghi chú'];
    const summaryHeaderRow = summarySheet.addRow(summaryHeaders);
    summaryHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const kpi = data.kpi || {};
    const summaryData = [
      ['Tổng thu', kpi.totalReceipts || 0, 'VND', ''],
      ['Tổng chi', kpi.totalPayments || 0, 'VND', ''],
      ['Dòng tiền ròng', kpi.netCashFlow || 0, 'VND', ''],
      ['Số dư đầu kỳ', kpi.openingBalance || 0, 'VND', ''],
      ['Số dư cuối kỳ', kpi.closingBalance || 0, 'VND', ''],
      ['Tăng trưởng thu', kpi.receiptGrowth || 0, '%', ''],
      ['Tăng trưởng chi', kpi.paymentGrowth || 0, '%', ''],
    ];

    summaryData.forEach((row: any[]) => {
      const dataRow = summarySheet.addRow(row);
      dataRow.getCell(2).numFmt = '#,##0 ₫';
    });

    summarySheet.getColumn(1).width = 25;
    summarySheet.getColumn(2).width = 18;
    summarySheet.getColumn(3).width = 12;
    summarySheet.getColumn(4).width = 20;

    // Sheet 2: Báo cáo Lãi/Lỗ
    const profitLossSheet = workbook.addWorksheet('Lai Lo');

    const plHeaders = ['Chỉ tiêu', 'Kỳ này', 'Kỳ trước', 'Tăng trưởng (%)'];
    const plHeaderRow = profitLossSheet.addRow(plHeaders);
    plHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const profitLoss = data.profitLoss || {};
    const plLines = profitLoss.lines || [];
    plLines.forEach((line: any) => {
      const row = profitLossSheet.addRow([
        line.label,
        line.currentPeriod,
        line.previousPeriod,
        line.growth,
      ]);
      row.getCell(2).numFmt = '#,##0 ₫';
      row.getCell(3).numFmt = '#,##0 ₫';
      row.getCell(4).numFmt = '0.00"%"';

      // Bold for subtotals and profit
      if (line.type === 'subtotal' || line.type === 'profit') {
        row.font = { bold: true };
      }
    });

    profitLossSheet.getColumn(1).width = 30;
    profitLossSheet.getColumn(2).width = 18;
    profitLossSheet.getColumn(3).width = 18;
    profitLossSheet.getColumn(4).width = 18;

    // Sheet 3: Sổ quỹ
    const cashLedgerSheet = workbook.addWorksheet('Sổ quỹ');

    const cashHeaders = ['Ngày', 'Số dư đầu', 'Thu', 'Chi', 'Số dư cuối'];
    const cashHeaderRow = cashLedgerSheet.addRow(cashHeaders);
    cashHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const cashLedger = data.cashLedger || [];
    cashLedger.forEach((entry: any) => {
      const row = cashLedgerSheet.addRow([
        entry.date,
        entry.openingBalance,
        entry.totalReceipts,
        entry.totalPayments,
        entry.closingBalance,
      ]);
      row.getCell(2).numFmt = '#,##0 ₫';
      row.getCell(3).numFmt = '#,##0 ₫';
      row.getCell(4).numFmt = '#,##0 ₫';
      row.getCell(5).numFmt = '#,##0 ₫';
    });

    cashLedgerSheet.getColumn(1).width = 12;
    cashLedgerSheet.getColumn(2).width = 15;
    cashLedgerSheet.getColumn(3).width = 15;
    cashLedgerSheet.getColumn(4).width = 15;
    cashLedgerSheet.getColumn(5).width = 15;

    // Sheet 4: Cơ cấu thu
    const receiptsSheet = workbook.addWorksheet('Cơ cấu thu');

    const receiptHeaders = ['Loại thu', 'Số tiền', 'Tỷ trọng (%)', 'Số lần'];
    const receiptHeaderRow = receiptsSheet.addRow(receiptHeaders);
    receiptHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const receiptsByType = data.receiptsByType || [];
    receiptsByType.forEach((item: any) => {
      const row = receiptsSheet.addRow([
        item.displayName,
        item.amount,
        item.percentage,
        item.count,
      ]);
      row.getCell(2).numFmt = '#,##0 ₫';
      row.getCell(3).numFmt = '0.00"%"';
    });

    receiptsSheet.getColumn(1).width = 20;
    receiptsSheet.getColumn(2).width = 15;
    receiptsSheet.getColumn(3).width = 15;
    receiptsSheet.getColumn(4).width = 10;

    // Sheet 5: Cơ cấu chi
    const paymentsSheet = workbook.addWorksheet('Cơ cấu chi');

    const paymentHeaders = ['Loại chi', 'Số tiền', 'Tỷ trọng (%)', 'Số lần'];
    const paymentHeaderRow = paymentsSheet.addRow(paymentHeaders);
    paymentHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const paymentsByType = data.paymentsByType || [];
    paymentsByType.forEach((item: any) => {
      const row = paymentsSheet.addRow([
        item.displayName,
        item.amount,
        item.percentage,
        item.count,
      ]);
      row.getCell(2).numFmt = '#,##0 ₫';
      row.getCell(3).numFmt = '0.00"%"';
    });

    paymentsSheet.getColumn(1).width = 20;
    paymentsSheet.getColumn(2).width = 15;
    paymentsSheet.getColumn(3).width = 15;
    paymentsSheet.getColumn(4).width = 10;

    // Sheet 6: Top khách hàng
    const customersSheet = workbook.addWorksheet('Top khách hàng');

    const customerHeaders = ['STT', 'Mã khách', 'Tên khách hàng', 'Phân loại', 'Số giao dịch', 'Tổng tiền'];
    const customerHeaderRow = customersSheet.addRow(customerHeaders);
    customerHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const topCustomers = data.topCustomers || [];
    topCustomers.forEach((customer: any, index: number) => {
      const row = customersSheet.addRow([
        index + 1,
        customer.customerCode,
        customer.customerName,
        customer.classification,
        customer.transactionCount,
        customer.totalAmount,
      ]);
      row.getCell(6).numFmt = '#,##0 ₫';
    });

    customersSheet.getColumn(1).width = 5;
    customersSheet.getColumn(2).width = 12;
    customersSheet.getColumn(3).width = 30;
    customersSheet.getColumn(4).width = 12;
    customersSheet.getColumn(5).width = 12;
    customersSheet.getColumn(6).width = 15;

    // Sheet 7: Top nhà cung cấp
    const suppliersSheet = workbook.addWorksheet('Top NCC');

    const supplierHeaders = ['STT', 'Mã NCC', 'Tên nhà cung cấp', 'Loại', 'Số giao dịch', 'Tổng tiền'];
    const supplierHeaderRow = suppliersSheet.addRow(supplierHeaders);
    supplierHeaderRow.eachCell((cell: any) => {
      cell.style = headerStyle;
    });

    const topSuppliers = data.topSuppliers || [];
    topSuppliers.forEach((supplier: any, index: number) => {
      const row = suppliersSheet.addRow([
        index + 1,
        supplier.supplierCode,
        supplier.supplierName,
        supplier.supplierType,
        supplier.transactionCount,
        supplier.totalAmount,
      ]);
      row.getCell(6).numFmt = '#,##0 ₫';
    });

    suppliersSheet.getColumn(1).width = 5;
    suppliersSheet.getColumn(2).width = 12;
    suppliersSheet.getColumn(3).width = 30;
    suppliersSheet.getColumn(4).width = 12;
    suppliersSheet.getColumn(5).width = 12;
    suppliersSheet.getColumn(6).width = 15;

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Get cash book report with filters and running balance
   */
  async getCashBookReport(params: {
    fromDate: string;
    toDate: string;
    customerId?: number;
    supplierId?: number;
    createdById?: number;   // NV lập phiếu
    receiverName?: string;
    receiverTypes?: string[]; // 'customer' | 'supplier' | 'other'
    voucherType?: string;     // receipt type or payment voucher type
    page?: number;
    pageSize?: number;
  }): Promise<any> {
    const {
      fromDate, toDate, customerId, supplierId, createdById,
      receiverName, receiverTypes, voucherType,
      page = 1, pageSize = 20,
    } = params;

    const startDate = new Date(fromDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    // ── Quỹ đầu kỳ: tổng giao dịch TRƯỚC fromDate (chỉ posted) ─────────────
    const [preReceipts, prePayments] = await Promise.all([
      prisma.paymentReceipt.aggregate({
        _sum: { amount: true },
        where: { receiptDate: { lt: startDate }, isPosted: true },
      }),
      prisma.paymentVoucher.aggregate({
        _sum: { amount: true },
        where: { paymentDate: { lt: startDate }, status: 'posted' },
      }),
    ]);
    const openingBalance =
      Number((preReceipts as any)._sum?.amount || 0) - Number((prePayments as any)._sum?.amount || 0);

    // ── Build where clauses ──────────────────────────────────────────────────
    const receiptWhere: any = {
      receiptDate: { gte: startDate, lte: endDate },
      deletedAt: null,
    };
    const paymentWhere: any = {
      paymentDate: { gte: startDate, lte: endDate },
      deletedAt: null,
    };

    if (customerId) receiptWhere.customerId = customerId;
    if (supplierId) paymentWhere.supplierId = supplierId;
    if (createdById) {
      receiptWhere.createdBy = createdById;
      paymentWhere.createdBy = createdById;
    }

    // voucherType filter
    const receiptTypes = ['sales','debt_collection','refund'];
    const paymentVoucherTypes = ['salary','operating_cost','supplier_payment','refund','other'];

    let wantReceipts = true;
    let wantPayments = true;

    if (voucherType) {
      if (receiptTypes.includes(voucherType)) {
        receiptWhere.receiptType = voucherType;
        wantPayments = false;
      } else if (paymentVoucherTypes.includes(voucherType)) {
        paymentWhere.voucherType = voucherType;
        wantReceipts = false;
      }
    }

    // receiverTypes filter
    if (receiverTypes && receiverTypes.length > 0) {
      wantReceipts = receiverTypes.includes('customer');
      if (!receiverTypes.includes('supplier') && !receiverTypes.includes('other')) wantPayments = false;
    }

    // ── Fetch transactions ───────────────────────────────────────────────────
    const [receipts, payments] = await Promise.all([
      wantReceipts ? prisma.paymentReceipt.findMany({
        where: receiptWhere,
        include: {
          creator: { select: { id: true, fullName: true, phone: true } },
          customerRef: { select: { id: true, customerName: true, address: true, phone: true } },
        },
        orderBy: { receiptDate: 'asc' },
      }) : Promise.resolve([]),
      wantPayments ? prisma.paymentVoucher.findMany({
        where: paymentWhere,
        include: {
          creator: { select: { id: true, fullName: true, phone: true } },
          supplier: { select: { id: true, supplierName: true, address: true, phone: true } },
        },
        orderBy: { paymentDate: 'asc' },
      }) : Promise.resolve([]),
    ]);

    // ── Normalise ────────────────────────────────────────────────────────────
    const entries: any[] = [];

    for (const r of receipts) {
      const customerName = r.customerRef?.customerName || '';
      if (receiverName && !customerName.toLowerCase().includes(receiverName.toLowerCase())) continue;

      entries.push({
        id: r.id,
        type: 'receipt' as const,
        voucherType: r.receiptType,
        code: r.receiptCode,
        datetime: r.receiptDate,
        partyName: customerName,
        partyType: 'customer',
        address: r.customerRef?.address || '',
        province: '',
        content: r.notes || '',
        amount: Number(r.amount),
        isReceipt: true,
        creator: r.creator,
        isPosted: r.isPosted,
      });
    }

    for (const p of payments) {
      const supplierName = p.supplier?.supplierName || '';
      if (receiverName && !supplierName.toLowerCase().includes(receiverName.toLowerCase())) continue;

      // receiverType filter for payments
      const pType = p.supplierId ? 'supplier' : 'other';
      if (receiverTypes && receiverTypes.length > 0 && !receiverTypes.includes(pType)) continue;

      entries.push({
        id: p.id,
        type: 'payment' as const,
        voucherType: p.voucherType,
        code: p.voucherCode,
        datetime: p.paymentDate,
        partyName: supplierName,
        partyType: pType,
        address: p.supplier?.address || '',
        province: '',
        content: p.reason || p.notes || '',
        amount: Number(p.amount),
        isReceipt: false,
        creator: p.creator,
        isPosted: p.status === 'posted',
      });
    }

    // ── Sort ascending for running balance ───────────────────────────────────
    entries.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    // ── Compute running balance ──────────────────────────────────────────────
    let runningBalance = openingBalance;
    for (const e of entries) {
      runningBalance = e.isReceipt ? runningBalance + e.amount : runningBalance - e.amount;
      e.runningBalance = runningBalance;
    }

    const closingBalance = runningBalance;
    const totalReceipt = entries.filter(e => e.isReceipt).reduce((s, e) => s + e.amount, 0);
    const totalPayment = entries.filter(e => !e.isReceipt).reduce((s, e) => s + e.amount, 0);

    // ── Pagination: reverse for display (newest first) ───────────────────────
    const displayEntries = [...entries].reverse();
    const total = displayEntries.length;
    const paginated = displayEntries.slice((page - 1) * pageSize, page * pageSize);

    return {
      openingBalance,
      totalReceipt,
      totalPayment,
      closingBalance,
      total,
      page,
      pageSize,
      transactions: paginated,
    };
  }
}

export default new FinancialService();
