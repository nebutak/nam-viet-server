import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Kiểm tra dữ liệu hiện tại...\n');

  try {
    // Kiểm tra warehouses
    const warehouses = await prisma.warehouse.findMany({
      where: { status: 'active' },
      select: { id: true, warehouseName: true },
    });
    console.log('📦 WAREHOUSES:');
    warehouses.forEach(w => console.log(`   ${w.id}. ${w.warehouseName}`));

    // Kiểm tra categories
    const categories = await prisma.category.findMany({
      where: { status: 'active' },
      select: { id: true, categoryName: true },
    });
    console.log('\n📂 CATEGORIES:');
    categories.forEach(c => console.log(`   ${c.id}. ${c.categoryName}`));

    // Kiểm tra products
    const products = await prisma.product.findMany({
      include: {
        category: { select: { categoryName: true } },
      },
      orderBy: { code: 'asc' },
    });
    console.log(`\n📝 PRODUCTS (${products.length} sản phẩm):`);
    products.forEach(p => {
      console.log(`   ${p.code} - ${p.productName} (${p.category?.categoryName || 'N/A'})`);
      console.log(`      Giá: ${p.price.toLocaleString()} đ, Min stock: ${p.minStockLevel}`);
    });

    // Kiểm tra inventory
    const inventory = await prisma.inventory.findMany({
      include: {
        product: { select: { code: true, productName: true, price: true, minStockLevel: true } },
        warehouse: { select: { warehouseName: true } },
      },
      orderBy: [
        { warehouseId: 'asc' },
        { product: { code: 'asc' } },
      ],
    });
    console.log(`\n📦 INVENTORY (${inventory.length} records):`);
    
    const byWarehouse = inventory.reduce((acc, inv) => {
      const whName = inv.warehouse.warehouseName;
      if (!acc[whName]) acc[whName] = [];
      acc[whName].push(inv);
      return acc;
    }, {} as Record<string, typeof inventory>);

    Object.entries(byWarehouse).forEach(([whName, items]) => {
      console.log(`\n   ${whName}:`);
      items.forEach(inv => {
        const isLowStock = inv.quantity < Number(inv.product.minStockLevel);
        const value = inv.quantity * Number(inv.product.price);
        console.log(`      ${inv.product.code}: ${inv.quantity} (${isLowStock ? '⚠️ TỒN THẤP' : '✅ OK'}) - ${value.toLocaleString()} đ`);
      });
    });

    // Kiểm tra expiry
    const expiries = await prisma.expiry.findMany({
      include: {
        product: { select: { code: true, productName: true } },
      },
      orderBy: { endDate: 'asc' },
    });
    console.log(`\n⏰ EXPIRY DATA (${expiries.length} records):`);
    const today = new Date();
    expiries.forEach(exp => {
      const daysUntilExpiry = Math.ceil((exp.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isExpiring = daysUntilExpiry <= 7;
      console.log(`   ${exp.product?.code}: ${isExpiring ? '⚠️ SẮP HẾT HẠN' : '✅ CÒN HẠN'} (${daysUntilExpiry} ngày)`);
      console.log(`      End date: ${exp.endDate.toISOString().split('T')[0]}`);
    });

    // Tính tổng theo filter "Kho bao bì trung tâm" + "Bao bì"
    const khoBaoBi = warehouses.find(w => w.warehouseName.includes('bao bì trung tâm'));
    const categoryBaoBi = categories.find(c => c.categoryName.includes('Bao bì'));
    
    if (khoBaoBi && categoryBaoBi) {
      console.log(`\n📊 FILTER TEST: Kho bao bì trung tâm + Bao bì`);
      const filtered = await prisma.inventory.findMany({
        where: {
          warehouseId: khoBaoBi.id,
          product: { categoryId: categoryBaoBi.id },
        },
        include: {
          product: { select: { code: true, productName: true, price: true, minStockLevel: true } },
        },
      });

      console.log(`   Số sản phẩm: ${filtered.length}`);
      let totalValue = 0;
      let totalQty = 0;
      let lowStockCount = 0;

      filtered.forEach(inv => {
        const value = inv.quantity * Number(inv.product.price);
        totalValue += value;
        totalQty += inv.quantity;
        if (inv.quantity < Number(inv.product.minStockLevel)) lowStockCount++;
        console.log(`   ${inv.product.code}: ${inv.quantity} - ${value.toLocaleString()} đ`);
      });

      console.log(`\n   📈 TỔNG KẾT:`);
      console.log(`      Tổng giá trị: ${totalValue.toLocaleString()} đ`);
      console.log(`      Số lượng sản phẩm: ${filtered.length}`);
      console.log(`      Cảnh báo tồn thấp: ${lowStockCount}`);
      console.log(`      Tổng số lượng: ${totalQty}`);
    }

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
