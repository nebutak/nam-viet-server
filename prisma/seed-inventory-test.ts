import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding inventory test data...\n');

  try {
    // Lấy warehouses, categories, products hiện có
    const warehouses = await prisma.warehouse.findMany({ where: { status: 'active' } });
    const categories = await prisma.category.findMany({ where: { status: 'active' } });
    
    console.log(`📦 Found ${warehouses.length} warehouses`);
    console.log(`📂 Found ${categories.length} categories`);

    if (warehouses.length === 0 || categories.length === 0) {
      console.log('⚠️  No warehouses or categories found. Please run main seed first.');
      return;
    }

    // Xóa dữ liệu inventory cũ
    console.log('\n🗑️  Cleaning old inventory data...');
    await prisma.inventory.deleteMany({});
    await prisma.product.deleteMany({});
    console.log('✅ Cleaned');

    // Tạo products với các loại khác nhau
    console.log('\n📝 Creating products...');
    
    const products = [];
    
    // 1. Nguyên liệu (raw_material) - 10 sản phẩm
    for (let i = 1; i <= 10; i++) {
      products.push({
        code: `NL-${String(i).padStart(3, '0')}`,
        productName: `Nguyên liệu ${i}`,
        categoryId: categories[0]?.id,
        basePrice: 50000 + (i * 10000),
        price: 70000 + (i * 15000),
        minStockLevel: 100 + (i * 10),
        status: 'active' as const,
      });
    }

    // 2. Bao bì (packaging) - 8 sản phẩm
    for (let i = 1; i <= 8; i++) {
      products.push({
        code: `BB-${String(i).padStart(3, '0')}`,
        productName: `Bao bì ${i}`,
        categoryId: categories[1]?.id || categories[0]?.id,
        basePrice: 5000 + (i * 1000),
        price: 8000 + (i * 1500),
        minStockLevel: 200 + (i * 20),
        status: 'active' as const,
      });
    }

    // 3. Thành phẩm (finished_product) - 12 sản phẩm
    for (let i = 1; i <= 12; i++) {
      products.push({
        code: `TP-${String(i).padStart(3, '0')}`,
        productName: `Thành phẩm ${i}`,
        categoryId: categories[2]?.id || categories[0]?.id,
        basePrice: 100000 + (i * 20000),
        price: 150000 + (i * 30000),
        minStockLevel: 50 + (i * 5),
        status: 'active' as const,
      });
    }

    // 4. Hàng hóa (goods) - 10 sản phẩm
    for (let i = 1; i <= 10; i++) {
      products.push({
        code: `HH-${String(i).padStart(3, '0')}`,
        productName: `Hàng hóa ${i}`,
        categoryId: categories[3]?.id || categories[0]?.id,
        basePrice: 80000 + (i * 15000),
        price: 120000 + (i * 25000),
        minStockLevel: 30 + (i * 3),
        status: 'active' as const,
      });
    }

    // Insert products
    const createdProducts = [];
    for (const product of products) {
      const created = await prisma.product.create({ data: product });
      createdProducts.push(created);
    }
    
    console.log(`✅ Created ${createdProducts.length} products`);

    // Tạo inventory data
    console.log('\n📦 Creating inventory data...');
    
    let inventoryCount = 0;
    let safeStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const warehouse of warehouses) {
      // Mỗi kho sẽ có một số sản phẩm ngẫu nhiên
      const productsInWarehouse = createdProducts.filter(() => Math.random() > 0.3); // 70% sản phẩm có trong kho

      for (const product of productsInWarehouse) {
        // Tạo số lượng tồn kho với các trường hợp khác nhau
        const random = Math.random();
        let quantity: number;
        let reservedQuantity: number;

        if (random < 0.15) {
          // 15% - Hết hàng
          quantity = 0;
          reservedQuantity = 0;
          outOfStockCount++;
        } else if (random < 0.35) {
          // 20% - Tồn thấp (dưới minStockLevel)
          quantity = Number(product.minStockLevel) * (0.3 + Math.random() * 0.6); // 30-90% của minStock
          reservedQuantity = quantity * (Math.random() * 0.2); // 0-20% reserved
          lowStockCount++;
        } else {
          // 65% - Tồn an toàn (trên minStockLevel)
          quantity = Number(product.minStockLevel) * (1.5 + Math.random() * 3); // 150-450% của minStock
          reservedQuantity = quantity * (Math.random() * 0.15); // 0-15% reserved
          safeStockCount++;
        }

        await prisma.inventory.create({
          data: {
            warehouseId: warehouse.id,
            productId: product.id,
            quantity: Math.round(quantity),
            reservedQuantity: Math.round(reservedQuantity),
          },
        });

        inventoryCount++;
      }
    }

    console.log(`✅ Created ${inventoryCount} inventory records`);
    console.log(`   - Safe stock: ${safeStockCount} (${Math.round(safeStockCount/inventoryCount*100)}%)`);
    console.log(`   - Low stock: ${lowStockCount} (${Math.round(lowStockCount/inventoryCount*100)}%)`);
    console.log(`   - Out of stock: ${outOfStockCount} (${Math.round(outOfStockCount/inventoryCount*100)}%)`);

    // Thống kê
    console.log('\n📊 Summary:');
    console.log(`   - Warehouses: ${warehouses.length}`);
    console.log(`   - Categories: ${categories.length}`);
    console.log(`   - Products: ${createdProducts.length}`);
    console.log(`     • Raw materials: 10`);
    console.log(`     • Packaging: 8`);
    console.log(`     • Finished products: 12`);
    console.log(`     • Goods: 10`);
    console.log(`   - Inventory records: ${inventoryCount}`);

    console.log('\n✅ Inventory test data seeded successfully!');

  } catch (error) {
    console.error('❌ Error seeding inventory data:', error);
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
