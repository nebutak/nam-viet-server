import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Kiểm tra kết quả filter tồn kho...\n');

  try {
    // Tìm kho "Kho bao bì trung tâm"
    const warehouse = await prisma.warehouse.findFirst({
      where: { warehouseName: { contains: 'bao bì trung tâm' } },
    });

    if (!warehouse) {
      console.log('❌ Không tìm thấy kho "Kho bao bì trung tâm"');
      return;
    }

    console.log(`✅ Tìm thấy kho: ${warehouse.warehouseName} (ID: ${warehouse.id})\n`);

    // Tìm danh mục "Bao bì"
    const category = await prisma.category.findFirst({
      where: { categoryName: { contains: 'Bao bì' } },
    });

    if (!category) {
      console.log('❌ Không tìm thấy danh mục "Bao bì"');
      return;
    }

    console.log(`✅ Tìm thấy danh mục: ${category.categoryName} (ID: ${category.id})\n`);

    // Truy vấn inventory với filter
    const inventory = await prisma.inventory.findMany({
      where: {
        warehouseId: warehouse.id,
        product: {
          categoryId: category.id,
        },
      },
      include: {
        product: {
          select: {
            code: true,
            productName: true,
            minStockLevel: true,
            basePrice: true,
            unit: true,
          },
        },
      },
    });

    console.log('📊 KẾT QUẢ FILTER:\n');
    console.log('Filter áp dụng:');
    console.log(`  - Kho: ${warehouse.warehouseName}`);
    console.log(`  - Danh mục: ${category.categoryName}`);
    console.log(`  - Loại sản phẩm: Tất cả loại`);
    console.log(`  - Trạng thái tồn: Tất cả\n`);

    // Tính toán KPI
    let totalValue = 0;
    let totalQuantity = 0;
    let lowStockCount = 0;

    console.log('Chi tiết sản phẩm:\n');
    inventory.forEach((inv, index) => {
      const availableQty = Number(inv.quantity) - Number(inv.reservedQuantity);
      const value = availableQty * Number(inv.product.basePrice || 0);
      const isLowStock = availableQty < Number(inv.product.minStockLevel);

      totalValue += value;
      totalQuantity += availableQty;
      if (isLowStock) lowStockCount++;

      console.log(`${index + 1}. ${inv.product.code} - ${inv.product.productName}`);
      console.log(`   Số lượng: ${availableQty} ${inv.product.unit || ''}`);
      console.log(`   Giá: ${Number(inv.product.basePrice).toLocaleString('vi-VN')} VNĐ`);
      console.log(`   Giá trị: ${value.toLocaleString('vi-VN')} VNĐ`);
      console.log(`   Min stock: ${Number(inv.product.minStockLevel)}`);
      console.log(`   Trạng thái: ${isLowStock ? '⚠️ TỒN THẤP' : '✅ AN TOÀN'}\n`);
    });

    console.log('═══════════════════════════════════════════════════════');
    console.log('📈 TỔNG KẾT:\n');
    console.log(`Tổng số sản phẩm: ${inventory.length} sản phẩm`);
    console.log(`Giá trị tồn kho: ${totalValue.toLocaleString('vi-VN')} VNĐ (${(totalValue / 1000000).toFixed(1)}M)`);
    console.log(`Cảnh báo tồn thấp: ${lowStockCount} sản phẩm`);
    console.log(`Tổng số lượng: ${totalQuantity.toLocaleString('vi-VN')} đơn vị`);
    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Lỗi:', error);
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
