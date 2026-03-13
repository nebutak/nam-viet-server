import { PrismaClient } from '@prisma/client';

export async function seedInventoryReport(prisma: PrismaClient) {
  console.log('📝 Seeding inventory for report testing...');

  // 1. Lấy warehouses
  const warehouses = await prisma.warehouse.findMany({
    where: { status: 'active' }
  });

  // 2. Lấy products
  const products = await prisma.product.findMany({
    where: { status: 'active' }
  });

  if (warehouses.length === 0 || products.length === 0) {
    console.log('⚠️ No warehouses or products found. Please run other seeds first.');
    return;
  }

  console.log(`Found ${warehouses.length} warehouses and ${products.length} products`);

  // 3. Tạo inventory với các trường hợp:
  // - Low stock (dưới minStockLevel)
  // - Normal stock (trên minStockLevel)
  // - Reserved quantity
  const inventoryData = [
    // Kho KHO-PB-001 (Kho Phân Bón Kênh Ngang)
    { warehouseCode: 'KHO-PB-001', code: 'SP-PB-001', quantity: 120, reservedQuantity: 10 }, // 120 > 50 (normal)
    { warehouseCode: 'KHO-PB-001', code: 'SP-PB-002', quantity: 20, reservedQuantity: 0 },  // 20 < 30 (LOW STOCK!)
    { warehouseCode: 'KHO-PB-001', code: 'SP-TBVTV-001', quantity: 150, reservedQuantity: 20 }, // 150 > 100 (normal)
    { warehouseCode: 'KHO-PB-001', code: 'SP-VTNN-001', quantity: 15, reservedQuantity: 5 }, // 15 < 20 (LOW STOCK!)

    // Kho KHO-TBVTV-001 (Kho Thuốc BVTV Bình Long)
    { warehouseCode: 'KHO-TBVTV-001', code: 'SP-TBVTV-001', quantity: 80, reservedQuantity: 10 }, // 80 < 100 (LOW STOCK!)
    { warehouseCode: 'KHO-TBVTV-001', code: 'SP-TBVTV-002', quantity: 200, reservedQuantity: 0 }, // 200 > 80 (normal)
    { warehouseCode: 'KHO-TBVTV-001', code: 'SP-PB-001', quantity: 60, reservedQuantity: 5 }, // 60 > 50 (normal)

    // Kho KHO-VTNN-001 (Kho Vật Tư Nông Nghiệp Trung Tâm)
    { warehouseCode: 'KHO-VTNN-001', code: 'SP-VTNN-001', quantity: 50, reservedQuantity: 0 }, // 50 > 20 (normal)
    { warehouseCode: 'KHO-VTNN-001', code: 'SP-PB-002', quantity: 10, reservedQuantity: 0 }, // 10 < 30 (LOW STOCK!)
    { warehouseCode: 'KHO-VTNN-001', code: 'SP-TBVTV-002', quantity: 40, reservedQuantity: 10 }, // 40 < 80 (LOW STOCK!)

    // Kho KHO-NL-001 (Kho Nguyên Liệu - ít sản phẩm)
    { warehouseCode: 'KHO-NL-001', code: 'SP-PB-001', quantity: 30, reservedQuantity: 0 }, // 30 < 50 (LOW STOCK!)
  ];

  // 4. Create/Update inventory records
  for (const inv of inventoryData) {
    const warehouse = warehouses.find(w => w.warehouseCode === inv.warehouseCode);
    const product = products.find(p => p.code === inv.code);

    if (!warehouse || !product) {
      console.log(`⚠️ Skipping: ${inv.warehouseCode} - ${inv.code} (not found)`);
      continue;
    }

    await prisma.inventory.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: warehouse.id,
          productId: product.id,
        }
      },
      update: {
        quantity: inv.quantity,
        reservedQuantity: inv.reservedQuantity,
      },
      create: {
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: inv.quantity,
        reservedQuantity: inv.reservedQuantity,
      },
    });

    const availableQty = inv.quantity - inv.reservedQuantity;
    const isLowStock = availableQty < Number(product.minStockLevel);
    console.log(`  ✓ ${warehouse.warehouseName} - ${product.productName}: ${availableQty} available (min: ${product.minStockLevel}) ${isLowStock ? '⚠️ LOW STOCK' : ''}`);
  }

  // 5. Thêm InventoryBatch cho sản phẩm có hạn sử dụng (test expiring)
  const tbvtvProducts = products.filter(p => p.code.startsWith('SP-TBVTV'));
  
  if (tbvtvProducts.length > 0) {
    const today = new Date();
    const khoTBVTV = warehouses.find(w => w.warehouseCode === 'KHO-TBVTV-001');
    
    for (const product of tbvtvProducts) {
      const inventory = await prisma.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: khoTBVTV!.id,
            productId: product.id,
          }
        }
      });

      if (inventory) {
        // Tạo batch sắp hết hạn (5 ngày nữa)
        const expDate = new Date(today);
        expDate.setDate(today.getDate() + 5);

        await prisma.inventoryBatch.upsert({
          where: {
            inventoryId_batchNumber_expiryDate: {
              inventoryId: inventory.id,
              batchNumber: `BATCH-${product.code}-001`,
              expiryDate: expDate,
            }
          },
          update: {
            quantity: 30,
          },
          create: {
            inventoryId: inventory.id,
            warehouseId: khoTBVTV!.id,
            productId: product.id,
            batchNumber: `BATCH-${product.code}-001`,
            expiryDate: expDate,
            quantity: 30,
            reservedQuantity: 0,
          },
        });
        console.log(`  ✓ Batch created for ${product.productName} - expires in 5 days`);
      }
    }
  }

  console.log('\n✅ Inventory seed completed!');
  console.log('\n📊 Test scenarios:');
  console.log('  - Low stock items: SP-PB-002, SP-VTNN-001 (KHO-PB-001), SP-TBVTV-001 (KHO-TBVTV-001), SP-PB-002 (KHO-VTNN-001), SP-TBVTV-002 (KHO-VTNN-001), SP-PB-001 (KHO-NL-001)');
  console.log('  - Normal stock: các sản phẩm còn lại');
  console.log('  - Expiring products: TBVTV products in KHO-TBVTV-001 (5 days)');
}
