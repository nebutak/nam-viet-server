import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.invoice.findMany({ include: { details: { include: { product: true } } }, take: 5 });
  const orderIds = orders.map(o => o.id);
  console.log('orderIds', orderIds);
  const refunds = await prisma.stockTransaction.findMany({
    where: { referenceType: 'sale_refunds', referenceId: { in: orderIds }, transactionType: 'import', isPosted: true, deletedAt: null },
    include: { details: true }
  });
  console.log('refunds', refunds.length);
  orders.map(order => {
    let refundedAmount = 0;
    const orderRefunds = refunds.filter(rt => rt.referenceId === order.id);
    orderRefunds.forEach(receipt => receipt.details.forEach(rd => {
      const invoiceItem = order.details.find(item => String(item.productId) === String(rd.productId));
      if (invoiceItem && Number(invoiceItem.quantity) > 0) {
        const itemEffectivePrice = Number(invoiceItem.total || 0) / Number(invoiceItem.quantity);
        refundedAmount += Number(rd.quantity || 0) * itemEffectivePrice;
      }
    }));
    console.log('order', order.id, 'refundedAmount:', refundedAmount);
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
