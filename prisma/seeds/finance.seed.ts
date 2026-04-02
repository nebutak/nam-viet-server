import { PrismaClient, ReceiptType, VoucherType, PaymentMethod, PaymentVoucherStatus } from '@prisma/client';

export async function seedFinancial(prisma: PrismaClient, adminId: number) {
  const invoices = await prisma.invoice.findMany({ take: 30 });
  const pos = await prisma.purchaseOrder.findMany({ take: 30 });

  const accountants = await prisma.user.findMany({ where: { role: { roleKey: 'accountant' } } });
  const staffId = accountants.length > 0 ? accountants[0].id : adminId;

  // 1. Thu tiền bán hàng
  for (const inv of invoices) {
    if (inv.paymentStatus === 'paid') {
      await prisma.paymentReceipt.create({
        data: {
          receiptCode: `REC-2024-${inv.id.toString().padStart(4, '0')}`,
          receiptType: ReceiptType.sales,
          customerId: inv.customerId,
          orderId: inv.id,
          amount: inv.totalAmount, // Đã paid
          paymentMethod: PaymentMethod.transfer,
          bankName: 'Vietcombank',
          transactionReference: `FT2403${inv.id}`,
          receiptDate: new Date(new Date(inv.orderDate).getTime() + 1000 * 60 * 60 * 2), // Thu sau 2 tiếng
          isPosted: true,
          createdBy: staffId,
        }
      });
    }
  }

  // 2. Chi tiền mua hàng
  for (const po of pos) {
    if (po.status === 'received' || po.status === 'approved') {
      await prisma.paymentVoucher.create({
        data: {
          voucherCode: `VOU-2024-${po.id.toString().padStart(4, '0')}`,
          voucherType: 'supplier_payment' as any, // Using type casting to bypass TS issues if VoucherType changes
          supplierId: po.supplierId,
          amount: po.totalAmount,
          paymentMethod: 'transfer' as any,
          bankName: 'Techcombank',
          paymentDate: new Date(new Date(po.orderDate).getTime() + 1000 * 60 * 60 * 24 * 3), // Thanh toán sau 3 ngày
          status: 'completed' as any,
          postedAt: new Date(new Date(po.orderDate).getTime() + 1000 * 60 * 60 * 24 * 3),
          reason: 'Thanh toán đơn mua hàng ' + po.poCode,
          createdBy: staffId,
          purchaseOrderId: po.id
        }
      });
    }
  }

  console.log('✅ Đã seed Tài chính (Thu chi - Receipts/Vouchers).');
}
