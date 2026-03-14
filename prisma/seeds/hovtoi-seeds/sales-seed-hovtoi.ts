import { PrismaClient, OrderStatus, PaymentStatus, TransactionType, TransactionStatus, ReceiptType, PaymentMethod, DeliveryStatus } from '@prisma/client';

export async function seedSalesAndReturns(prisma: PrismaClient) {
  console.log('🌱 Seeding Sales & Returns...');

  const creatorId = 1;

  const customer = await prisma.customer.findUnique({ where: { customerCode: 'CUS001' } }) || await prisma.customer.findFirst();
  const warehouse = await prisma.warehouse.findFirst();
  const products = await prisma.product.findMany({ take: 2 });

  if (!customer || !warehouse || products.length === 0) {
    console.log('⚠️ Missing Customer, Warehouse, or Products. Run other seeds first.');
    return;
  }

  // --- 1. NORMAL SALE: Incomplete payment (Leaves Debt) ---
  const invoice1 = await prisma.invoice.create({
    data: {
      orderCode: 'INV-00001',
      customerId: customer.id,
      warehouseId: warehouse.id,
      orderDate: new Date(),
      totalAmount: 10000000,
      amount: 10000000,
      paidAmount: 3000000, // Đã thanh toán 3 triệu, nợ 7 triệu
      paymentStatus: PaymentStatus.partial,
      orderStatus: OrderStatus.completed,
      createdBy: creatorId,
      approvedBy: creatorId,
      approvedAt: new Date(),
      completedAt: new Date(),
      details: {
        create: products.map(p => ({
          productId: p.id,
          quantity: 2,
          price: 5000000,
          total: 10000000
        }))
      }
    }
  });

  // Export Stock transaction
  await prisma.stockTransaction.create({
    data: {
      transactionCode: 'EXP-00001',
      transactionType: TransactionType.export,
      warehouseId: warehouse.id,
      referenceType: 'Invoice',
      referenceId: invoice1.id,
      reason: 'Xuất hàng bán',
      status: TransactionStatus.completed,
      createdBy: creatorId,
      approvedBy: creatorId,
      approvedAt: new Date(),
      details: {
        create: products.map(p => ({
          productId: p.id,
          quantity: 2,
          unitPrice: 5000000,
        }))
      }
    }
  });

  // Deduct Inventory
  for (const p of products) {
    await prisma.inventory.update({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: p.id } },
      data: { quantity: { decrement: 2 } }
    });
  }

  // Payment Receipt (Sales)
  await prisma.paymentReceipt.create({
    data: {
      receiptCode: 'PR-00001',
      receiptType: ReceiptType.sales,
      customerId: customer.id,
      orderId: invoice1.id,
      amount: 3000000,
      paymentMethod: PaymentMethod.transfer,
      receiptDate: new Date(),
      isPosted: true,
      createdBy: creatorId,
      approvedBy: creatorId,
      approvedAt: new Date()
    }
  });

  // Create Delivery record for Invoice
  await prisma.delivery.create({
    data: {
      deliveryCode: 'DEL-INV-1',
      orderId: invoice1.id,
      deliveryStaffId: creatorId,
      deliveryDate: new Date(),
      deliveryStatus: DeliveryStatus.delivered,
      collectedAmount: 0,
      notes: 'Đã giao hàng thành công'
    }
  });

  // Update Customer Debt (+7M)
  await prisma.customer.update({
    where: { id: customer.id },
    data: { currentDebt: { increment: 7000000 } }
  });

  console.log('✅ Created Sales Invoice (Debt 7M):', invoice1.orderCode);


  // --- 2. SALES RETURN: Trả hàng (Refund) ---
  const invoice2 = await prisma.invoice.create({
    data: {
      orderCode: 'INV-RET-1',
      customerId: customer.id,
      warehouseId: warehouse.id,
      orderDate: new Date(),
      totalAmount: 5000000,
      amount: 5000000,
      paidAmount: 5000000,
      paymentStatus: PaymentStatus.paid,
      orderStatus: OrderStatus.cancelled, // Đơn bị hủy/trả
      notes: 'Khách hàng trả lại hàng, yêu cầu hoàn tiền',
      createdBy: creatorId,
      cancelledBy: creatorId,
      cancelledAt: new Date(),
      details: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
            price: 5000000,
            total: 5000000
          }
        ]
      }
    }
  });

  // Refund Receipt
  await prisma.paymentReceipt.create({
    data: {
      receiptCode: 'PR-REFUND-1',
      receiptType: ReceiptType.refund,
      customerId: customer.id,
      orderId: invoice2.id,
      amount: 5000000,
      paymentMethod: PaymentMethod.cash,
      receiptDate: new Date(),
      isPosted: true,
      notes: 'Hoàn tiền trả hàng',
      createdBy: creatorId,
      approvedBy: creatorId,
      approvedAt: new Date()
    }
  });

  // Import Stock transaction (Return to warehouse)
  await prisma.stockTransaction.create({
    data: {
      transactionCode: 'RET-00001',
      transactionType: TransactionType.import,
      warehouseId: warehouse.id,
      referenceType: 'InvoiceReturn',
      referenceId: invoice2.id,
      reason: 'Khách hàng trả hàng',
      status: TransactionStatus.completed,
      createdBy: creatorId,
      approvedBy: creatorId,
      approvedAt: new Date(),
      details: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
            unitPrice: 5000000,
          }
        ]
      }
    }
  });

  // Increase Inventory Back
  await prisma.inventory.update({
    where: { warehouseId_productId: { warehouseId: warehouse.id, productId: products[0].id } },
    data: { quantity: { increment: 1 } }
  });

  console.log('✅ Created Return / Refund Data for Customer');
}
