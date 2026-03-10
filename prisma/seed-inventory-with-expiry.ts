import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding inventory with expiry data...\n');

  try {
    // Lấy warehouses và categories
    const warehouses = await prisma.warehouse.findMany({ where: { status: 'active' } });
    const categories = await prisma.category.findMany({ where: { status: 'active' } });

    if (warehouses.length === 0 || categories.length === 0) {
      console.log('⚠️  No warehouses or categories found. Please run main seed first.');
      return;
    }

    // Tạo hoặc lấy expiry account
    let expiryAccount = await prisma.customerExpiryAccount.findFirst();
    
    if (!expiryAccount) {
      console.log('📝 Creating expiry account...');
      // Lấy customer đầu tiên hoặc tạo mới
      let customer = await prisma.customer.findFirst();
      
      if (!customer) {
        console.log('📝 Creating test customer...');
        customer = await prisma.customer.create({
          data: {
            customerCode: 'TEST-001',
            customerName: 'Test Customer',
            customerType: 'individual',
            phone: '0123456789',
            email: 'test@example.com',
            address: 'Test Address',
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
      console.log('✅ Created expiry account\n');
    }

    // Xóa dữ liệu cũ
    console.log('🗑️  Cleaning old data...');
    await prisma.expiry.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.product.deleteMany({});
    console.log('✅ Cleaned\n');

    // Tạo products
    console.log('📝 Creating products...');
    const products = [];

    // Nguyên liệu - 5 sản phẩm
    for (let i = 1; i <= 5; i++) {
      products.push({
        code: `NL-${String(i).padStart(3, '0')}`,
        productName: `Nguyên liệu ${i}`,
        categoryId: categories[0]?.id,
        basePrice: 50000,
        price: 70000,
        minStockLevel: 100,
        status: 'active' as const,
      });
    }

    // Bao bì - 5 sản phẩm
    for (let i = 1; i <= 5; i++) {
      products.push({
        code: `BB-${String(i).padStart(3, '0')}`,
        productName: `Bao bì ${i}`,
        categoryId: categories[1]?.id || categories[0]?.id,
        basePrice: 6000,
        price: 8000,
        minStockLevel: 200,
        status: 'active' as const,
      });
    }

    const createdProducts = [];
    for (const product of products) {
      const created = await prisma.product.create({ data: product });
      createdProducts.push(created);
    }
    console.log(`✅ Created ${createdProducts.length} products\n`);

    // Tạo inventory
    console.log('📦 Creating inventory...');
    let inventoryCount = 0;

    for (const warehouse of warehouses) {
      for (const product of createdProducts) {
        await prisma.inventory.create({
          data: {
            warehouseId: warehouse.id,
            productId: product.id,
            quantity: 150,
            reservedQuantity: 0,
          },
        });
        inventoryCount++;
      }
    }
    console.log(`✅ Created ${inventoryCount} inventory records\n`);

    // Tạo expiry data
    console.log('⏰ Creating expiry data...');
    const today = new Date();
    const accountId = expiryAccount.id;

    let expiringCount = 0;
    let normalCount = 0;

    // Tạo expiry cho một số sản phẩm
    // 3 sản phẩm đầu tiên: SẮP HẾT HẠN (trong vòng 7 ngày)
    for (let i = 0; i < 3; i++) {
      const product = createdProducts[i];
      const daysUntilExpiry = i + 3; // 3, 4, 5 ngày
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + daysUntilExpiry);

      await prisma.expiry.create({
        data: {
          accountId,
          productId: product.id,
          startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 ngày trước
          endDate,
          category: 'product',
          alertDateStep: 7, // Cảnh báo trước 7 ngày
          note: `Sắp hết hạn trong ${daysUntilExpiry} ngày`,
        },
      });
      expiringCount++;
      console.log(`   ⚠️  ${product.code} - ${product.productName}: Hết hạn sau ${daysUntilExpiry} ngày`);
    }

    // 2 sản phẩm tiếp theo: KHÔNG SẮP HẾT HẠN (còn 30 ngày)
    for (let i = 3; i < 5; i++) {
      const product = createdProducts[i];
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 30); // 30 ngày sau

      await prisma.expiry.create({
        data: {
          accountId,
          productId: product.id,
          startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
          endDate,
          category: 'product',
          alertDateStep: 7,
          note: 'Còn hạn sử dụng',
        },
      });
      normalCount++;
      console.log(`   ✅ ${product.code} - ${product.productName}: Còn hạn 30 ngày`);
    }

    // 5 sản phẩm còn lại: KHÔNG CÓ EXPIRY DATA
    console.log(`   ℹ️  ${createdProducts.length - 5} sản phẩm không có dữ liệu hạn sử dụng`);

    console.log(`\n✅ Created ${expiringCount + normalCount} expiry records`);
    console.log(`   - Sắp hết hạn (≤7 ngày): ${expiringCount}`);
    console.log(`   - Còn hạn (>7 ngày): ${normalCount}`);

    // Thống kê
    console.log('\n📊 SUMMARY:');
    console.log(`   - Warehouses: ${warehouses.length}`);
    console.log(`   - Products: ${createdProducts.length}`);
    console.log(`   - Inventory records: ${inventoryCount}`);
    console.log(`   - Expiry records: ${expiringCount + normalCount}`);
    console.log('\n📋 TEST SCENARIOS:');
    console.log('   1. Không check "Sắp hết hạn": Hiển thị tất cả 10 sản phẩm');
    console.log('   2. Check "Sắp hết hạn": Chỉ hiển thị 3 sản phẩm đầu (NL-001, NL-002, NL-003)');
    console.log('   3. Filter "Kho bao bì" + "Sắp hết hạn": Không có kết quả (vì 3 sản phẩm sắp hết hạn là NL)');
    console.log('   4. Filter "Nguyên liệu" + "Sắp hết hạn": Hiển thị 3 sản phẩm (NL-001, NL-002, NL-003)');

    console.log('\n✅ Seed completed successfully!');

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
