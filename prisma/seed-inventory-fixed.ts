import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding FIXED inventory test data (no random)...\n');

  try {
    // Lấy warehouses và categories
    const warehouses = await prisma.warehouse.findMany({ 
      where: { status: 'active' },
      orderBy: { id: 'asc' }
    });
    const categories = await prisma.category.findMany({ 
      where: { status: 'active' },
      orderBy: { id: 'asc' }
    });
    
    console.log(`📦 Found ${warehouses.length} warehouses:`);
    warehouses.forEach(w => console.log(`   - ${w.warehouseName} (ID: ${w.id})`));
    
    console.log(`\n📂 Found ${categories.length} categories:`);
    categories.forEach(c => console.log(`   - ${c.categoryName} (ID: ${c.id})`));

    if (warehouses.length === 0 || categories.length === 0) {
      console.log('\n⚠️  No warehouses or categories found. Please run main seed first.');
      return;
    }

    // Xóa dữ liệu cũ
    console.log('\n🗑️  Cleaning old data...');
    await prisma.inventory.deleteMany({});
    await prisma.product.deleteMany({});
    console.log('✅ Cleaned');

    // Tạo products CỐ ĐỊNH
    console.log('\n📝 Creating FIXED products...');
    
    const products = [];
    
    // === NGUYÊN LIỆU (10 sản phẩm) - Category 0 ===
    for (let i = 1; i <= 10; i++) {
      products.push({
        code: `NL-${String(i).padStart(3, '0')}`,
        productName: `Nguyên liệu ${i}`,
        categoryId: categories[0]?.id,
        basePrice: 50000 + (i * 10000),
        price: 70000 + (i * 15000),
        minStockLevel: 100,
        status: 'active' as const,
      });
    }

    // === BAO BÌ (8 sản phẩm) - Category 1 ===
    for (let i = 1; i <= 8; i++) {
      products.push({
        code: `BB-${String(i).padStart(3, '0')}`,
        productName: `Bao bì ${i}`,
        categoryId: categories[1]?.id || categories[0]?.id,
        basePrice: 5000 + (i * 1000),
        price: 8000 + (i * 1500),
        minStockLevel: 200,
        status: 'active' as const,
      });
    }

    // === THÀNH PHẨM (12 sản phẩm) - Category 2 ===
    for (let i = 1; i <= 12; i++) {
      products.push({
        code: `TP-${String(i).padStart(3, '0')}`,
        productName: `Thành phẩm ${i}`,
        categoryId: categories[2]?.id || categories[0]?.id,
        basePrice: 100000 + (i * 20000),
        price: 150000 + (i * 30000),
        minStockLevel: 50,
        status: 'active' as const,
      });
    }

    // === HÀNG HÓA (10 sản phẩm) - Category 3 ===
    for (let i = 1; i <= 10; i++) {
      products.push({
        code: `HH-${String(i).padStart(3, '0')}`,
        productName: `Hàng hóa ${i}`,
        categoryId: categories[3]?.id || categories[0]?.id,
        basePrice: 80000 + (i * 15000),
        price: 120000 + (i * 25000),
        minStockLevel: 30,
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

    // === TẠO INVENTORY CỐ ĐỊNH ===
    console.log('\n📦 Creating FIXED inventory data...');
    
    // Phân bổ sản phẩm vào kho CỐ ĐỊNH
    const inventoryData = [];

    // KHO 0 (Kho nguyên liệu trung tâm): Tất cả NL + một số BB
    // - NL-001 đến NL-010: An toàn (quantity = 300)
    // - BB-001, BB-002: Tồn thấp (quantity = 150)
    for (let i = 0; i < 10; i++) {
      inventoryData.push({
        warehouseId: warehouses[0].id,
        productId: createdProducts[i].id, // NL-001 to NL-010
        quantity: 300,
        reservedQuantity: 0,
      });
    }
    inventoryData.push({
      warehouseId: warehouses[0].id,
      productId: createdProducts[10].id, // BB-001
      quantity: 150, // Tồn thấp (< 200)
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[0].id,
      productId: createdProducts[11].id, // BB-002
      quantity: 150, // Tồn thấp
      reservedQuantity: 0,
    });

    // KHO 1 (Kho bao bì trung tâm): Tất cả BB
    // - BB-001 đến BB-004: An toàn (quantity = 500)
    // - BB-005, BB-006: Tồn thấp (quantity = 100)
    // - BB-007, BB-008: Hết hàng (quantity = 0)
    for (let i = 10; i < 14; i++) { // BB-001 to BB-004
      inventoryData.push({
        warehouseId: warehouses[1].id,
        productId: createdProducts[i].id,
        quantity: 500, // An toàn
        reservedQuantity: 0,
      });
    }
    inventoryData.push({
      warehouseId: warehouses[1].id,
      productId: createdProducts[14].id, // BB-005
      quantity: 100, // Tồn thấp
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[1].id,
      productId: createdProducts[15].id, // BB-006
      quantity: 100, // Tồn thấp
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[1].id,
      productId: createdProducts[16].id, // BB-007
      quantity: 0, // Hết hàng
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[1].id,
      productId: createdProducts[17].id, // BB-008
      quantity: 0, // Hết hàng
      reservedQuantity: 0,
    });

    // KHO 2 (Kho thành phẩm trung tâm): Tất cả TP
    // - TP-001 đến TP-008: An toàn (quantity = 200)
    // - TP-009, TP-010: Tồn thấp (quantity = 30)
    // - TP-011, TP-012: Hết hàng (quantity = 0)
    for (let i = 18; i < 26; i++) { // TP-001 to TP-008
      inventoryData.push({
        warehouseId: warehouses[2].id,
        productId: createdProducts[i].id,
        quantity: 200, // An toàn
        reservedQuantity: 0,
      });
    }
    inventoryData.push({
      warehouseId: warehouses[2].id,
      productId: createdProducts[26].id, // TP-009
      quantity: 30, // Tồn thấp
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[2].id,
      productId: createdProducts[27].id, // TP-010
      quantity: 30, // Tồn thấp
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[2].id,
      productId: createdProducts[28].id, // TP-011
      quantity: 0, // Hết hàng
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[2].id,
      productId: createdProducts[29].id, // TP-012
      quantity: 0, // Hết hàng
      reservedQuantity: 0,
    });

    // KHO 3 (Kho hàng hóa trung tâm): Tất cả HH
    // - HH-001 đến HH-006: An toàn (quantity = 100)
    // - HH-007, HH-008: Tồn thấp (quantity = 20)
    // - HH-009, HH-010: Hết hàng (quantity = 0)
    for (let i = 30; i < 36; i++) { // HH-001 to HH-006
      inventoryData.push({
        warehouseId: warehouses[3].id,
        productId: createdProducts[i].id,
        quantity: 100, // An toàn
        reservedQuantity: 0,
      });
    }
    inventoryData.push({
      warehouseId: warehouses[3].id,
      productId: createdProducts[36].id, // HH-007
      quantity: 20, // Tồn thấp
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[3].id,
      productId: createdProducts[37].id, // HH-008
      quantity: 20, // Tồn thấp
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[3].id,
      productId: createdProducts[38].id, // HH-009
      quantity: 0, // Hết hàng
      reservedQuantity: 0,
    });
    inventoryData.push({
      warehouseId: warehouses[3].id,
      productId: createdProducts[39].id, // HH-010
      quantity: 0, // Hết hàng
      reservedQuantity: 0,
    });

    // Insert inventory
    for (const inv of inventoryData) {
      await prisma.inventory.create({ data: inv });
    }

    console.log(`✅ Created ${inventoryData.length} inventory records`);

    // === TÍNH TOÁN KẾT QUẢ CHO TEST CASE ===
    console.log('\n' + '='.repeat(70));
    console.log('📊 KẾT QUẢ DỰ KIẾN CHO TEST CASE');
    console.log('='.repeat(70));

    console.log('\n🧪 TEST: Kho bao bì trung tâm + Danh mục Bao bì + Tất cả loại + Tất cả trạng thái\n');

    const bbCategory = categories[1];
    const bbWarehouse = warehouses[1];
    
    console.log(`Filter:`);
    console.log(`  - Kho: ${bbWarehouse.warehouseName}`);
    console.log(`  - Danh mục: ${bbCategory?.categoryName || 'N/A'}`);
    console.log(`  - Loại sản phẩm: Tất cả loại`);
    console.log(`  - Trạng thái tồn: Tất cả\n`);

    // BB-001 to BB-008 trong kho bao bì
    const testProducts = [
      { code: 'BB-001', qty: 500, price: 6000, min: 200, status: 'An toàn' },
      { code: 'BB-002', qty: 500, price: 7000, min: 200, status: 'An toàn' },
      { code: 'BB-003', qty: 500, price: 8000, min: 200, status: 'An toàn' },
      { code: 'BB-004', qty: 500, price: 9000, min: 200, status: 'An toàn' },
      { code: 'BB-005', qty: 100, price: 10000, min: 200, status: 'Tồn thấp' },
      { code: 'BB-006', qty: 100, price: 11000, min: 200, status: 'Tồn thấp' },
      { code: 'BB-007', qty: 0, price: 12000, min: 200, status: 'Hết hàng' },
      { code: 'BB-008', qty: 0, price: 13000, min: 200, status: 'Hết hàng' },
    ];

    let totalValue = 0;
    let totalQty = 0;
    let lowStockCount = 0;

    console.log('Chi tiết:\n');
    testProducts.forEach((p, i) => {
      const value = p.qty * p.price;
      totalValue += value;
      totalQty += p.qty;
      if (p.status === 'Tồn thấp') lowStockCount++;

      console.log(`${i + 1}. ${p.code}`);
      console.log(`   Số lượng: ${p.qty}`);
      console.log(`   Giá: ${p.price.toLocaleString('vi-VN')} VNĐ`);
      console.log(`   Giá trị: ${value.toLocaleString('vi-VN')} VNĐ`);
      console.log(`   Trạng thái: ${p.status}\n`);
    });

    console.log('═'.repeat(70));
    console.log('📈 KẾT QUẢ MONG ĐỢI:\n');
    console.log(`✅ Tổng số sản phẩm: 8 sản phẩm`);
    console.log(`✅ Giá trị tồn kho: ${totalValue.toLocaleString('vi-VN')} VNĐ (${(totalValue / 1000000).toFixed(1)}M)`);
    console.log(`✅ Cảnh báo tồn thấp: ${lowStockCount} sản phẩm`);
    console.log(`✅ Tổng số lượng: ${totalQty.toLocaleString('vi-VN')} đơn vị`);
    console.log('═'.repeat(70));

    console.log('\n✅ FIXED inventory test data seeded successfully!');
    console.log('📝 Bây giờ bạn có thể test trên UI và so sánh với kết quả trên.');

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
