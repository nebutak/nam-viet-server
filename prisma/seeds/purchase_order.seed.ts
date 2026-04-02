import { PrismaClient, PurchaseOrderStatus } from '@prisma/client';

export async function seedPurchaseOrders(prisma: PrismaClient, adminId: number) {
  const suppliers = await prisma.supplier.findMany({ take: 30 });
  const products = await prisma.product.findMany({ take: 20 });
  const user = await prisma.user.findFirst({ where: { role: { roleKey: 'warehouse_manager' } } });
  const staffId = user?.id || adminId;

  if (suppliers.length === 0 || products.length === 0) return;

  for (let i = 1; i <= 30; i++) {
    const randomSupplier = suppliers[Math.floor(Math.random() * suppliers.length)];
    // Chọn 2-3 sản phẩm ngẫu nhiên
    const numItems = Math.floor(Math.random() * 3) + 1;
    let selectedProducts = [];
    for (let j = 0; j < numItems; j++) {
      selectedProducts.push(products[Math.floor(Math.random() * products.length)]);
    }

    let subTotal = 0;
    const itemsData = selectedProducts.map(p => {
      const quantity = Math.floor(Math.random() * 50) + 10;
      const price = Number(p.basePrice || p.price || 50000) * 0.7; // Nhập rẻ hơn bán
      const total = quantity * price;
      subTotal += total;
      return {
        productId: p.id,
        quantity: quantity,
        price: price,
        total: total,
      };
    });

    const taxAmount = subTotal * 0.1;

    const statuses: PurchaseOrderStatus[] = ['pending', 'approved', 'received'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    await prisma.purchaseOrder.create({
      data: {
        poCode: `PO-2024-${i.toString().padStart(4, '0')}`,
        supplierId: randomSupplier.id,
        orderDate: new Date(2024, 2, (i % 28) + 1), // Rải trong tháng 3
        expectedDeliveryDate: new Date(2024, 2, (i % 28) + 5),
        subTotal: subTotal,
        totalAmount: subTotal + taxAmount,
        status: randomStatus,
        createdBy: staffId,
        approvedBy: randomStatus !== 'pending' ? adminId : null,
        details: {
          create: itemsData
        }
      }
    });
  }
  console.log('✅ Đã seed 30 Đơn mua hàng (PurchaseOrder).');
}
