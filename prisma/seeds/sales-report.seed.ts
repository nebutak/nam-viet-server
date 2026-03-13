/**
 * Seed data for Sales Report testing
 * Run: npx tsx prisma/seeds/sales-report.seed.ts
 */

import { PrismaClient, OrderStatus, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📝 Seeding sales report test data...\n');

  // Get existing data
  const warehouse = await prisma.warehouse.findFirst({ where: { status: 'active' } });
  if (!warehouse) {
    console.log('❌ No warehouse found. Please run main seed first.');
    return;
  }

  const users = await prisma.user.findMany({ where: { status: 'active' } });
  if (users.length === 0) {
    console.log('❌ No users found. Please run main seed first.');
    return;
  }

  const products = await prisma.product.findMany({ take: 5 });
  if (products.length === 0) {
    console.log('❌ No products found. Please run main seed first.');
    return;
  }

  // Create customers
  console.log('👥 Creating customers...');
  const customers = await Promise.all([
    prisma.customer.upsert({
      where: { phone: '0900111222' },
      update: {},
      create: {
        customerCode: 'KH-001',
        customerName: 'Cửa hàng Phân Bón Minh Hiếu',
        customerType: 'company',
        classification: 'wholesale',
        phone: '0900111222',
        address: '123 Đường 30/4, TP. Cao Lãnh, Đồng Tháp',
        currentDebt: 0,
        status: 'active',
      },
    }),
    prisma.customer.upsert({
      where: { phone: '0900333444' },
      update: {},
      create: {
        customerCode: 'KH-002',
        customerName: 'Anh Nguyễn Văn A',
        customerType: 'individual',
        classification: 'retail',
        phone: '0900333444',
        address: '456 Khu vực 1, Huyện Châu Thành, An Giang',
        currentDebt: 0,
        status: 'active',
      },
    }),
    prisma.customer.upsert({
      where: { phone: '0900555666' },
      update: {},
      create: {
        customerCode: 'KH-003',
        customerName: 'Trang trại Lúa Mùa Bình Minh',
        customerType: 'company',
        classification: 'vip',
        phone: '0900555666',
        address: '789 Xã Bình Thành, Huyện Tháp Mười, Đồng Tháp',
        currentDebt: 0,
        status: 'active',
      },
    }),
    prisma.customer.upsert({
      where: { phone: '0900777888' },
      update: {},
      create: {
        customerCode: 'KH-004',
        customerName: 'Chị Trần Thị B',
        customerType: 'individual',
        classification: 'retail',
        phone: '0900777888',
        address: '101 Khu vực 3, TX. Sa Đéc, Đồng Tháp',
        currentDebt: 0,
        status: 'active',
      },
    }),
    prisma.customer.upsert({
      where: { phone: '0900999000' },
      update: {},
      create: {
        customerCode: 'KH-005',
        customerName: 'Đại lý Nông nghiệp Thành Đạt',
        customerType: 'company',
        classification: 'distributor',
        phone: '0900999000',
        address: '202 QL1A, Huyện Lấp Vò, Đồng Tháp',
        currentDebt: 0,
        status: 'active',
      },
    }),
  ]);
  console.log(`✅ Created ${customers.length} customers\n`);

  // Create invoices for different dates
  console.log('🧾 Creating invoices...');
  const today = new Date();
  const invoices = [];

  // Delete existing test invoices first to avoid unique constraint errors
  // First delete invoice details, then invoices
  await prisma.invoiceDetail.deleteMany({});
  await prisma.invoice.deleteMany({});

  // Invoice 1: Today - completed, fully paid (pickup)
  const invoice1 = await prisma.invoice.create({
    data: {
      orderCode: `HD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-001`,
      customerId: customers[0].id,
      warehouseId: warehouse.id,
      orderDate: today,
      completedAt: today,
      isPickupOrder: true,
      totalAmount: 15000000,
      subTotal: 15000000,
      discountAmount: 1500000,
      paidAmount: 13500000,
      paymentStatus: 'paid',
      orderStatus: 'completed',
      createdBy: users[0].id,
      approvedBy: users[0].id,
      notes: 'Seed test data - Bán sỉ phân bón NPK',
    },
  });

  // Invoice Details 1
  await prisma.invoiceDetail.createMany({
    data: [
      {
        orderId: invoice1.id,
        productId: products[0].id,
        quantity: 50,
        price: 150000,
        discountRate: 10,
        discountAmount: 750000,
        subTotal: 6750000,
        total: 6750000,
      },
      {
        orderId: invoice1.id,
        productId: products[1]?.id || products[0].id,
        quantity: 100,
        price: 82500,
        discountRate: 10,
        discountAmount: 750000,
        subTotal: 7500000,
        total: 7500000,
      },
    ],
  });
  invoices.push(invoice1);

  // Invoice 2: Yesterday - completed, partial paid (delivery)
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const invoice2 = await prisma.invoice.create({
    data: {
      orderCode: `HD-${yesterday.toISOString().split('T')[0].replace(/-/g, '')}-002`,
      customerId: customers[1].id,
      warehouseId: warehouse.id,
      orderDate: yesterday,
      completedAt: yesterday,
      isPickupOrder: false,
      deliveryAddress: '456 Khu vực 1, Huyện Châu Thành, An Giang',
      totalAmount: 5500000,
      subTotal: 5500000,
      discountAmount: 0,
      paidAmount: 2000000,
      paymentStatus: 'partial',
      orderStatus: 'completed',
      createdBy: users[0].id,
      approvedBy: users[0].id,
      notes: 'Seed test data - Bán lẻ thuốc bảo vệ thực vật',
    },
  });

  await prisma.invoiceDetail.createMany({
    data: [
      {
        orderId: invoice2.id,
        productId: products[2]?.id || products[0].id,
        quantity: 10,
        price: 550000,
        subTotal: 5500000,
        total: 5500000,
      },
    ],
  });
  invoices.push(invoice2);

  // Invoice 3: 3 days ago - completed, unpaid (pickup)
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const invoice3 = await prisma.invoice.create({
    data: {
      orderCode: `HD-${threeDaysAgo.toISOString().split('T')[0].replace(/-/g, '')}-003`,
      customerId: customers[2].id,
      warehouseId: warehouse.id,
      orderDate: threeDaysAgo,
      completedAt: threeDaysAgo,
      isPickupOrder: true,
      totalAmount: 28000000,
      subTotal: 28000000,
      discountAmount: 0,
      paidAmount: 0,
      paymentStatus: 'unpaid',
      orderStatus: 'completed',
      createdBy: users[1]?.id || users[0].id,
      approvedBy: users[0].id,
      notes: 'Seed test data - Bán buôn phân bón và thuốc',
    },
  });

  await prisma.invoiceDetail.createMany({
    data: [
      {
        orderId: invoice3.id,
        productId: products[0].id,
        quantity: 100,
        price: 150000,
        subTotal: 15000000,
        total: 15000000,
      },
      {
        orderId: invoice3.id,
        productId: products[2]?.id || products[0].id,
        quantity: 20,
        price: 650000,
        subTotal: 13000000,
        total: 13000000,
      },
    ],
  });
  invoices.push(invoice3);

  // Invoice 4: 7 days ago - pending (delivery)
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const invoice4 = await prisma.invoice.create({
    data: {
      orderCode: `HD-${sevenDaysAgo.toISOString().split('T')[0].replace(/-/g, '')}-004`,
      customerId: customers[3].id,
      warehouseId: warehouse.id,
      orderDate: sevenDaysAgo,
      isPickupOrder: false,
      deliveryAddress: '101 Khu vực 3, TX. Sa Đéc, Đồng Tháp',
      totalAmount: 3200000,
      subTotal: 3200000,
      discountAmount: 200000,
      paidAmount: 0,
      paymentStatus: 'unpaid',
      orderStatus: 'pending',
      createdBy: users[0].id,
      notes: 'Seed test data - Đơn hàng đang chờ xác nhận',
    },
  });

  await prisma.invoiceDetail.createMany({
    data: [
      {
        orderId: invoice4.id,
        productId: products[0].id,
        quantity: 20,
        price: 160000,
        discountRate: 10,
        discountAmount: 200000,
        subTotal: 3200000,
        total: 3000000,
      },
    ],
  });
  invoices.push(invoice4);

  // Invoice 5: 10 days ago - completed, paid (delivery)
  const tenDaysAgo = new Date(today);
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const invoice5 = await prisma.invoice.create({
    data: {
      orderCode: `HD-${tenDaysAgo.toISOString().split('T')[0].replace(/-/g, '')}-005`,
      customerId: customers[4].id,
      warehouseId: warehouse.id,
      orderDate: tenDaysAgo,
      completedAt: tenDaysAgo,
      isPickupOrder: false,
      deliveryAddress: '202 QL1A, Huyện Lấp Vò, Đồng Tháp',
      totalAmount: 45000000,
      subTotal: 45000000,
      discountAmount: 5000000,
      paidAmount: 40000000,
      paymentStatus: 'partial',
      orderStatus: 'completed',
      createdBy: users[1]?.id || users[0].id,
      approvedBy: users[0].id,
      notes: 'Seed test data - Đại lý thanh toán 1 phần',
    },
  });

  await prisma.invoiceDetail.createMany({
    data: [
      {
        orderId: invoice5.id,
        productId: products[0].id,
        quantity: 200,
        price: 145000,
        discountRate: 10,
        discountAmount: 2900000,
        subTotal: 26100000,
        total: 26100000,
      },
      {
        orderId: invoice5.id,
        productId: products[1]?.id || products[0].id,
        quantity: 100,
        price: 85000,
        discountRate: 10,
        discountAmount: 850000,
        subTotal: 7650000,
        total: 7650000,
      },
      {
        orderId: invoice5.id,
        productId: products[2]?.id || products[0].id,
        quantity: 20,
        price: 562500,
        discountRate: 10,
        discountAmount: 1125000,
        subTotal: 11250000,
        total: 11250000,
      },
    ],
  });
  invoices.push(invoice5);

  // Invoice 6: 15 days ago - completed, paid (pickup)
  const fifteenDaysAgo = new Date(today);
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  const invoice6 = await prisma.invoice.create({
    data: {
      orderCode: `HD-${fifteenDaysAgo.toISOString().split('T')[0].replace(/-/g, '')}-006`,
      customerId: customers[0].id,
      warehouseId: warehouse.id,
      orderDate: fifteenDaysAgo,
      completedAt: fifteenDaysAgo,
      isPickupOrder: true,
      totalAmount: 8500000,
      subTotal: 8500000,
      discountAmount: 850000,
      paidAmount: 7650000,
      paymentStatus: 'paid',
      orderStatus: 'completed',
      createdBy: users[0].id,
      approvedBy: users[0].id,
    },
  });

  await prisma.invoiceDetail.createMany({
    data: [
      {
        orderId: invoice6.id,
        productId: products[0].id,
        quantity: 50,
        price: 170000,
        discountRate: 10,
        discountAmount: 850000,
        subTotal: 8500000,
        total: 7650000,
      },
    ],
  });
  invoices.push(invoice6);

  // Invoice 7: 20 days ago - cancelled
  const twentyDaysAgo = new Date(today);
  twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
  const invoice7 = await prisma.invoice.create({
    data: {
      orderCode: `HD-${twentyDaysAgo.toISOString().split('T')[0].replace(/-/g, '')}-007`,
      customerId: customers[1].id,
      warehouseId: warehouse.id,
      orderDate: twentyDaysAgo,
      cancelledAt: twentyDaysAgo,
      isPickupOrder: false,
      totalAmount: 5000000,
      subTotal: 5000000,
      discountAmount: 0,
      paidAmount: 0,
      paymentStatus: 'unpaid',
      orderStatus: 'cancelled',
      createdBy: users[0].id,
      cancelledBy: users[0].id,
      notes: 'Seed test data - Đơn hàng bị hủy do khách hàng yêu cầu',
    },
  });

  await prisma.invoiceDetail.createMany({
    data: [
      {
        orderId: invoice7.id,
        productId: products[0].id,
        quantity: 25,
        price: 200000,
        subTotal: 5000000,
        total: 5000000,
      },
    ],
  });
  invoices.push(invoice7);

  // Invoice 8: 25 days ago - completed, paid (delivery)
  const twentyFiveDaysAgo = new Date(today);
  twentyFiveDaysAgo.setDate(twentyFiveDaysAgo.getDate() - 25);
  const invoice8 = await prisma.invoice.create({
    data: {
      orderCode: `HD-${twentyFiveDaysAgo.toISOString().split('T')[0].replace(/-/g, '')}-008`,
      customerId: customers[2].id,
      warehouseId: warehouse.id,
      orderDate: twentyFiveDaysAgo,
      completedAt: twentyFiveDaysAgo,
      isPickupOrder: false,
      deliveryAddress: '789 Xã Bình Thành, Huyện Tháp Mười, Đồng Tháp',
      totalAmount: 22000000,
      subTotal: 22000000,
      discountAmount: 0,
      paidAmount: 22000000,
      paymentStatus: 'paid',
      orderStatus: 'completed',
      createdBy: users[1]?.id || users[0].id,
      approvedBy: users[0].id,
    },
  });

  await prisma.invoiceDetail.createMany({
    data: [
      {
        orderId: invoice8.id,
        productId: products[1]?.id || products[0].id,
        quantity: 200,
        price: 110000,
        subTotal: 22000000,
        total: 22000000,
      },
    ],
  });
  invoices.push(invoice8);

  console.log(`✅ Created ${invoices.length} invoices\n`);

  // Update customer debts
  console.log('💰 Updating customer debts...');
  const customerDebts = await prisma.invoice.aggregate({
    where: {
      customerId: { in: customers.map(c => c.id) },
      orderStatus: 'completed',
    },
    _sum: {
      totalAmount: true,
      paidAmount: true,
    },
  });

  // Calculate actual debt per customer
  for (const customer of customers) {
    const customerInvoices = await prisma.invoice.findMany({
      where: {
        customerId: customer.id,
        orderStatus: 'completed',
      },
    });

    let totalDebt = 0;
    for (const inv of customerInvoices) {
      totalDebt += Number(inv.totalAmount) - Number(inv.paidAmount);
    }

    if (totalDebt > 0) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          currentDebt: totalDebt,
          debtUpdatedAt: new Date(),
        },
      });
    }
  }
  console.log('✅ Customer debts updated\n');

  console.log('✅ Sales report test data seeded successfully!\n');
  console.log('📊 Test Data Summary:');
  console.log(`   - Customers: ${customers.length}`);
  console.log(`   - Invoices: ${invoices.length}`);
  console.log(`   - Date range: ${twentyFiveDaysAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);
  console.log('\n🎯 You can now test the Sales Report at:');
  console.log('   http://localhost:5173/sales-report\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding sales report data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
