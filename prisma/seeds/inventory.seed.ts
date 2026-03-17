import { PrismaClient } from '@prisma/client';

export async function seedInventory(prisma: PrismaClient, adminUserId: number) {
  console.log('📦 Seeding initial inventory...');

  // 1. Get references
  const warehouses = await prisma.warehouse.findMany();
  const products = await prisma.product.findMany();

  const khoChinh = warehouses.find(w => w.warehouseCode === 'KHO-CHINH-001');
  const khoNL = warehouses.find(w => w.warehouseCode === 'KHO-NL-001');
  const khoTPHN = warehouses.find(w => w.warehouseCode === 'KHO-TP-HN');

  if (!khoChinh || !khoNL) {
    console.error('❌ Required warehouses not found. Skipping inventory seed.');
    return;
  }

  // 2. Define initial stock data
  const inventoryData = [
    // Products in Kho Chinh
    {
      productCode: 'SP-PB-001',
      warehouseId: khoChinh.id,
      quantity: 500,
    },
    {
      productCode: 'SP-PB-002',
      warehouseId: khoChinh.id,
      quantity: 300,
    },
    {
      productCode: 'SP-TBVTV-001',
      warehouseId: khoChinh.id,
      quantity: 150,
    },
    {
      productCode: 'SP-TBVTV-002',
      warehouseId: khoChinh.id,
      quantity: 200,
    },
    {
      productCode: 'SP-VTNN-001',
      warehouseId: khoChinh.id,
      quantity: 50,
    },

    // Materials in Kho Nguyen Lieu
    {
      productCode: 'MAT-PL-001',
      warehouseId: khoNL.id,
      quantity: 5000,
    },
    {
      productCode: 'MAT-CH-001',
      warehouseId: khoNL.id,
      quantity: 1000,
    },

    // Some products in branch warehouses
    ...(khoTPHN ? [
      {
        productCode: 'SP-PB-001',
        warehouseId: khoTPHN.id,
        quantity: 100,
      }
    ] : [])
  ];

  const seededInventories = [];

  for (const item of inventoryData) {
    const product = products.find(p => p.code === item.productCode);
    if (!product) continue;

    const inventory = await prisma.inventory.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: item.warehouseId,
          productId: product.id,
        },
      },
      update: {
        quantity: item.quantity,
        updatedBy: adminUserId,
      },
      create: {
        warehouseId: item.warehouseId,
        productId: product.id,
        quantity: item.quantity,
        reservedQuantity: 0,
        updatedBy: adminUserId,
      },
    });
    seededInventories.push(inventory);
  }

  console.log(`✅ Seeded ${seededInventories.length} inventory records.\n`);
  return seededInventories;
}
