import { PrismaClient, TransactionType } from '@prisma/client';

export async function seedStockTransactions(prisma: PrismaClient, adminId: number) {
  // Lấy dữ liệu PO và Invoice
  const invoices = await prisma.invoice.findMany({ take: 30, include: { details: true } });
  const pos = await prisma.purchaseOrder.findMany({ take: 30, include: { details: true } });
  const warehouses = await prisma.warehouse.findMany();

  if (warehouses.length === 0) return;
  const staff = await prisma.user.findFirst({ where: { role: { roleKey: 'warehouse_manager' } } });
  const staffId = staff?.id || adminId;

  // 1. Nhập từ Đơn mua (Import) cho các PO đã 'received'
  for (const po of pos) {
    if (po.status !== 'received') continue;

    const targetWarehouse = warehouses[Math.floor(Math.random() * warehouses.length)];
    const detailsData = po.details.map(d => ({
      productId: d.productId,
      quantity: d.quantity
    }));

    await prisma.stockTransaction.create({
      data: {
        transactionCode: `IMP-2024-${po.id.toString().padStart(4, '0')}`,
        transactionType: TransactionType.import,
        warehouseId: targetWarehouse.id,
        referenceType: 'PurchaseOrder',
        referenceId: po.id,
        supplierId: po.supplierId,
        reason: 'Nhập hàng từ Nhà Cung Cấp',
        isPosted: true,
        createdBy: staffId,
        details: { create: detailsData }
      }
    });
  }

  // 2. Xuất cho Đơn bán hàng (Export) dành cho Invoice 'completed'
  for (const inv of invoices) {
    if (inv.orderStatus !== 'completed') continue;

    const sourceWarehouse = warehouses[Math.floor(Math.random() * warehouses.length)];
    const detailsData = inv.details.map(d => ({
      productId: d.productId,
      quantity: d.quantity // Số lượng xuất
    }));

    await prisma.stockTransaction.create({
      data: {
        transactionCode: `EXP-2024-${inv.id.toString().padStart(4, '0')}`,
        transactionType: TransactionType.export,
        warehouseId: sourceWarehouse.id,
        referenceType: 'Invoice',
        referenceId: inv.id,
        customerId: inv.customerId,
        reason: 'Xuất hàng bán',
        isPosted: true,
        createdBy: staffId,
        details: { create: detailsData }
      }
    });
  }

  // 3. Chuyển kho nội bộ (5 lệnh)
  if (warehouses.length > 1) {
    for (let i = 1; i <= 5; i++) {
        let wh1 = warehouses[0];
        let wh2 = warehouses[1];

        // Ensure distinct source and dest
        if(warehouses.length > 2) {
            const idx1 = Math.floor(Math.random() * warehouses.length);
            let idx2 = Math.floor(Math.random() * warehouses.length);
            while(idx1 === idx2) idx2 = Math.floor(Math.random() * warehouses.length);
            wh1 = warehouses[idx1];
            wh2 = warehouses[idx2];
        }

        const randomProduct = await prisma.product.findFirst();
        if(!randomProduct) continue;

        await prisma.stockTransfer.create({
            data: {
                transferCode: `TRF-2024-00${i}`,
                fromWarehouseId: wh1.id,
                toWarehouseId: wh2.id,
                transferDate: new Date(),
                totalValue: 5000000,
                status: 'completed',
                requestedBy: staffId,
                approvedBy: adminId,
                approvedAt: new Date(),
                details: {
                    create: [
                        {
                            productId: randomProduct.id,
                            quantity: 10,
                            unitPrice: Number(randomProduct.basePrice || 500000)
                        }
                    ]
                }
            }
        });
    }
  }

  console.log('✅ Đã seed Giao dịch nhập/xuất kho (Stock Transactions & Transfers).');
}
