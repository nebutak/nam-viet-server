import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding simple inventory data...\n');

  try {
    // Lấy warehouses và categories
    const warehouses = await prisma.warehouse.findMany({ 
      where: { status: 'active' },
      take: 2, // Chỉ lấy 2 kho đầu tiên
    });
    const categories = await prisma.category.findMany({ where: { status: 'active' } });
    const accounts = await prisma.customerExpiryAccount.findFirst();

    if (warehouses.length < 2) {
      console.log('⚠️  Need at least 2 warehouses. Please run main seed first.');
      return;
    }

    // Tạo expiry account nếu chưa có
    let expiryAccount = accounts;
    if (!expiryAccount) {
      let customer = await prisma.customer.findFirst();
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            customerCode: 'TEST-001',
            customerName: 'Test Customer',
            customerType: 'individual',
            status: 'active',
          },
        });
      }
      expiryAccount = await prisma.customerExpiryAccount.create({
        data: {
          customerId: customer.id,
          accountName: 'Test Expiry Account',
          accountCreatedAt: new Date(),
        },
      });
    }

    // Xóa dữ liệu cũ
    console.log('🗑️  Cleaning old data...');
    await prisma.expiry.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.product.deleteMany({});
    console.log('✅ Cleaned\n');

    // Tạo 6 sản phẩm
    console.log('📝 Creating 6 products...');
    const products = [
      // Nguyên liệu
      { code: 'NL-001', name: 'Nguyên liệu A', categoryId: categories[0]?.id, price: 100000, qty: 50, minStock: 100 },
      { code: 'NL-002', name: 'Nguyên liệu B', categoryId: categories[0]?.id, price: 200000, qty: 200, minStock: 100 },
      { code: 'NL-003', name: 'Nguyên liệu C', categoryId: categories[0]?.id, price: 150000, qty: 80, minStock: 100 },
      // Bao bì
      { code: 'BB-001', name: 'Bao bì A', categoryId: categories[1]?.id || categories[0]?.id, price: 10000, qty: 500, minStock: 200 },
      { code: 'BB-002', name: 'Bao bì B', categoryId: categories[1]?.id || categories[0]?.id, price: 20000, qty: 150, minStock: 200 },
      { code: 'BB-003', name: 'Bao bì C', categoryId: categories[1]?.id || categories[0]?.id, price: 15000, qty: 100, minStock: 200 },
    ];

    const createdProducts = [];
    for (const p of products) {
      const product = await prisma.product.create({
        data: {
          code: p.code,
          productName: p.name,
          categoryId: p.categoryId,
          basePrice: p.price,
          price: p.price,
          minStockLevel: p.minStock,
          status: 'active',
        },
      });
      createdProducts.push({ ...product, qty: p.qty });
    }
    console.log('✅ Created 6 products\n');

    // Tạo inventory (mỗi sản phẩm ở 2 kho)
    console.log('📦 Creating inventory...');
    for (const product of createdProducts) {
      for (const warehouse of warehouses) {
        await prisma.inventory.create({
          data: {
            warehouseId: warehouse.id,
            productId: product.id,
            quantity: product.qty,
            reservedQuantity: 0,
          },
        });
      }
    }
    console.log('✅ Created 12 inventory records (6 products × 2 warehouses)\n');

    // Tạo expiry data
    console.log('⏰ Creating expiry data...');
    const today = new Date();
    
    // NL-001: Hết hạn sau 5 ngày
    const nl001EndDate = new Date(today);
    nl001EndDate.setDate(today.getDate() + 5);
    await prisma.expiry.create({
      data: {
        accountId: expiryAccount.id,
        productId: createdProducts[0].id,
        startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate: nl001EndDate,
        category: 'product',
        alertDateStep: 7,
        note: 'Hết hạn sau 5 ngày',
      },
    });
    console.log('   ⚠️  NL-001: Hết hạn sau 5 ngày');

    // BB-003: Hết hạn sau 3 ngày
    const bb003EndDate = new Date(today);
    bb003EndDate.setDate(today.getDate() + 3);
    await prisma.expiry.create({
      data: {
        accountId: expiryAccount.id,
        productId: createdProducts[5].id,
        startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate: bb003EndDate,
        category: 'product',
        alertDateStep: 7,
        note: 'Hết hạn sau 3 ngày',
      },
    });
    console.log('   ⚠️  BB-003: Hết hạn sau 3 ngày');
    console.log('✅ Created 2 expiry records\n');

    // Tổng kết
    console.log('📊 SUMMARY:');
    console.log('   - Products: 6 (3 NL + 3 BB)');
    console.log('   - Inventory: 12 records (6 × 2 kho)');
    console.log('   - Expiry: 2 records');
    console.log('\n📋 EXPECTED RESULTS:');
    console.log('   🔹 Tồn thấp: 4 sản phẩm (NL-001, NL-003, BB-002, BB-003)');
    console.log('   🔹 Sắp hết hạn: 2 sản phẩm (NL-001, BB-003)');
    console.log('   🔹 Vừa tồn thấp VÀ sắp hết hạn: 2 sản phẩm (NL-001, BB-003)');
    console.log('\n✅ Seed completed!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
