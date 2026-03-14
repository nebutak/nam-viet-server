import { PrismaClient, PurchaseOrderStatus, TransactionType, TransactionStatus, VoucherType, PaymentMethod } from '@prisma/client';

export async function seedPurchaseAndInventory(prisma: PrismaClient) {
  console.log('🌱 Seeding Purchase & Inventory...');

  const creator = await prisma.user.findFirst();
  const creatorId = creator?.id || 1;

  const warehouse = await prisma.warehouse.findFirst();
  const supplier = await prisma.supplier.findFirst();
  const products = await prisma.product.findMany({ take: 3 });

  if (!warehouse || !supplier || products.length === 0) {
    console.log('⚠️ Missing Warehouse, Supplier, or Products. Please run qlbh.sql first.');
    return;
  }

  // 1. Create a Purchase Order
  const po = await prisma.purchaseOrder.create({
    data: {
      poCode: 'PO-00001',
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      orderDate: new Date(),
      expectedDeliveryDate: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
      subTotal: 50000000,
      taxRate: 10,
      totalAmount: 55000000,
      status: PurchaseOrderStatus.received,
      createdBy: creatorId,
      details: {
        create: products.map(p => ({
          productId: p.id,
          quantity: 100,
          unitPrice: p.price ? Number(p.price) * 0.7 : 100000, // Nhập rẻ hơn bán 30%
        }))
      }
    }
  });

  console.log('✅ Created Purchase Order:', po.poCode);

  // 2. Add Stock Transaction (Import)
  const stockTx = await prisma.stockTransaction.create({
    data: {
      transactionCode: 'IMP-00001',
      transactionType: TransactionType.import,
      warehouseId: warehouse.id,
      referenceType: 'PurchaseOrder',
      referenceId: po.id,
      totalValue: 50000000,
      reason: 'Nhập hàng từ nhà cung cấp',
      status: TransactionStatus.completed,
      createdBy: creatorId,
      approvedBy: creatorId,
      approvedAt: new Date(),
      details: {
        create: products.map(p => ({
          productId: p.id,
          quantity: 100,
          unitPrice: p.price ? Number(p.price) * 0.7 : 100000,
        }))
      }
    }
  });

  console.log('✅ Created Stock Transaction:', stockTx.transactionCode);

  // 3. Update Inventory & Add Batches
  for (const p of products) {
    const inventory = await prisma.inventory.upsert({
      where: {
        warehouseId_productId: { warehouseId: warehouse.id, productId: p.id }
      },
      update: {
        quantity: { increment: 100 }
      },
      create: {
        warehouseId: warehouse.id,
        productId: p.id,
        quantity: 100,
        updatedBy: creatorId
      }
    });

    await prisma.inventoryBatch.create({
      data: {
        inventoryId: inventory.id,
        warehouseId: warehouse.id,
        productId: p.id,
        batchNumber: `BATCH-${p.id}-${Date.now()}`,
        expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)), // 2 năm
        quantity: 100,
        updatedBy: creatorId
      }
    });
  }
  
  console.log('✅ Updated Inventory for products');

  // 4. Create Payment Voucher (Partial Payment -> creates Debt for Supplier)
  // Total string: 55,000,000, we pay 20,000,000. So we owe 35,000,000.
  const voucher = await prisma.paymentVoucher.create({
    data: {
      voucherCode: 'PV-00001',
      voucherType: VoucherType.supplier_payment,
      supplierId: supplier.id,
      amount: 20000000,
      paymentMethod: PaymentMethod.transfer,
      paymentDate: new Date(),
      isPosted: true,
      createdBy: creatorId,
      approvedBy: creatorId,
      approvedAt: new Date(),
      notes: 'Thanh toán một phần đơn hàng PO-00001'
    }
  });

  // Update Supplier Debt
  await prisma.supplier.update({
    where: { id: supplier.id },
    data: {
      totalPayable: { increment: 35000000 },
      payableUpdatedAt: new Date()
    }
  });

  console.log('✅ Created Payment Voucher and Updated Supplier Debt:', voucher.voucherCode);
}
