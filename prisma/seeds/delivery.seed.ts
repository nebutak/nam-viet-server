import { PrismaClient, DeliveryStatus, SettlementStatus } from '@prisma/client';

export async function seedDeliveries(prisma: PrismaClient, adminId: number) {
  const invoices = await prisma.invoice.findMany({ take: 30 });
  const deliveryStaff = await prisma.user.findMany({ where: { role: { roleKey: 'delivery_staff' } } });
  
  if (deliveryStaff.length === 0 || invoices.length === 0) return;

  for (const inv of invoices) {
    if (inv.orderStatus === 'cancelled') continue;

    const randomStaff = deliveryStaff[Math.floor(Math.random() * deliveryStaff.length)];
    const randomStatus: DeliveryStatus[] = ['in_transit', 'delivered', 'failed'];
    const status = randomStatus[Math.floor(Math.random() * randomStatus.length)];
    const isSettled = status === 'delivered' ? 'settled' : 'pending';

    await prisma.delivery.create({
      data: {
        deliveryCode: `DEL-2024-${inv.id.toString().padStart(4, '0')}`,
        orderId: inv.id,
        deliveryStaffId: randomStaff.id,
        shippingPartner: 'GHTK',
        deliveryDate: new Date(new Date(inv.orderDate).getTime() + 2 * 24 * 60 * 60 * 1000), // Giao sau 2 ngày
        deliveryStatus: status as DeliveryStatus,
        deliveryCost: 35000,
        codAmount: inv.paymentStatus === 'unpaid' ? Number(inv.totalAmount) : 0,
        collectedAmount: (status === 'delivered' && inv.paymentStatus === 'unpaid') ? Number(inv.totalAmount) : 0,
        settlementStatus: isSettled as SettlementStatus,
        settledBy: isSettled === 'settled' ? adminId : null,
        settledAt: isSettled === 'settled' ? new Date() : null,
      }
    });

  }
  console.log('✅ Đã seed Giao hàng (Deliveries) cho các đơn xuất.');
}
