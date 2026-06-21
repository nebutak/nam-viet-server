import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export class CashFlowService {
  async getLedger(query: any) {
    const { fromDate, toDate, keyword } = query;

    const receiptWhere: any = { deletedAt: null, isPosted: true };
    const voucherWhere: any = { deletedAt: null, status: 'posted' };

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);

      receiptWhere.receiptDate = { gte: start, lte: end };
      voucherWhere.paymentDate = { gte: start, lte: end };
    }

    if (keyword) {
      receiptWhere.OR = [
        { notes: { contains: keyword } },
        { customerRef: { customerName: { contains: keyword } } },
        { customerRef: { phone: { contains: keyword } } },
        { receiptCode: { contains: keyword } },
      ];
      voucherWhere.OR = [
        { notes: { contains: keyword } },
        { reason: { contains: keyword } },
        { voucherCode: { contains: keyword } },
        { supplier: { supplierName: { contains: keyword } } },
        { customer: { customerName: { contains: keyword } } },
        { employee: { fullName: { contains: keyword } } },
      ];
    }

    // Fetch Receipts
    const receipts = await prisma.paymentReceipt.findMany({
      where: receiptWhere,
      include: {
        customerRef: true,
        supplier: true,
        creator: true,
      },
      orderBy: { receiptDate: 'asc' },
    });

    // Fetch Vouchers
    const vouchers = await prisma.paymentVoucher.findMany({
      where: voucherWhere,
      include: {
        supplier: true,
        customer: true,
        employee: true,
        creator: true,
      },
      orderBy: { paymentDate: 'asc' },
    });

    // Transform and Merge
    const merged: any[] = [];

    // Transform Receipts
    for (const r of receipts) {
      const isOpeningBalance = r.notes?.trim() === 'Thu đầu kỳ';

      let typeLabel = 'Thu khác';
      if (isOpeningBalance) typeLabel = 'Thu đầu kỳ';
      else if (r.receiptType === 'sales') typeLabel = 'Thu khách hàng';
      else if (r.receiptType === 'debt_collection') typeLabel = 'Thu nợ';
      else if (r.receiptType === 'refund') typeLabel = 'Hoàn trả NCC';

      merged.push({
        id: `PT-${r.id}`,
        code: r.receiptCode,
        date: r.receiptDate,
        type: 'receipt',
        typeLabel,
        isOpeningBalance,
        partnerName: r.customerRef?.customerName || r.supplier?.supplierName || '',
        phone: r.customerRef?.phone || r.supplier?.phone || '',
        address: r.customerRef?.address || r.supplier?.address || '',
        content: isOpeningBalance ? 'THU ĐẦU KỲ' : (r.notes || 'Thu tiền'),
        amount: Number(r.amount),
        submitter: (r.creator as any)?.fullName || '',
      });
    }

    // Transform Vouchers
    for (const v of vouchers) {
      let partnerName = '';
      let phone = '';
      let address = '';

      if (v.supplier) {
        partnerName = v.supplier.supplierName;
        phone = v.supplier.phone || '';
        address = v.supplier.address || '';
      } else if (v.customer) {
        partnerName = v.customer.customerName;
        phone = v.customer.phone || '';
        address = v.customer.address || '';
      } else if (v.employee) {
        partnerName = v.employee.fullName;
        phone = v.employee.phone || '';
      }

      let typeLabel = 'Chi khác';
      if (v.voucherType === 'supplier_payment') typeLabel = 'Chi nhà cung cấp';
      else if (v.voucherType === 'salary') typeLabel = 'Lương';
      else if (v.voucherType === 'refund') typeLabel = 'Hoàn tiền';

      merged.push({
        id: `PC-${v.id}`,
        code: v.voucherCode,
        date: v.paymentDate,
        type: 'voucher',
        typeLabel,
        isOpeningBalance: false,
        partnerName,
        phone,
        address,
        content: v.reason || v.notes || 'Chi tiền',
        amount: -Number(v.amount), // negative for vouchers
        submitter: (v.creator as any)?.fullName || '',
      });
    }

    // Sort merged array by date descending (newest first)
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate Summaries
    let openingBalance = 0;
    let totalIn = 0;
    let totalOut = 0;

    for (const item of merged) {
      if (item.isOpeningBalance) {
        openingBalance += item.amount;
      } else if (item.amount > 0) {
        totalIn += item.amount;
      } else {
        totalOut += Math.abs(item.amount);
      }
    }

    const endingBalance = openingBalance + totalIn - totalOut;

    // Calculate running balance (from oldest to newest, then reverse)
    const chronological = [...merged].reverse();
    let runningBal = openingBalance;
    for (const item of chronological) {
      if (!item.isOpeningBalance) {
        runningBal += item.amount;
      }
      item.runningBalance = runningBal;
    }

    return {
      data: merged,
      summary: {
        openingBalance,
        totalIn,
        totalOut,
        endingBalance,
      },
    };
  }
}

export default new CashFlowService();
