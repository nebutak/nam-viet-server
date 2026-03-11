import { PrismaClient } from '@prisma/client';

export async function seedWarehouses(prisma: PrismaClient) {
  console.log('📝 Seeding warehouses for agricultural supplies...');

  const warehouses = await Promise.all([
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-PB-001' },
      update: {},
      create: {
        warehouseCode: 'KHO-PB-001',
        warehouseName: 'Kho Phân Bón Kênh Ngang',
        warehouseType: 'product',
        address: '123 Kênh Ngang, An Giang',
        city: 'An Giang',
        region: 'Đồng bằng sông Cửu Long',
        capacity: 5000,
        status: 'active',
      },
    }),
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-TBVTV-001' },
      update: {},
      create: {
        warehouseCode: 'KHO-TBVTV-001',
        warehouseName: 'Kho Thuốc BVTV Bình Long',
        warehouseType: 'product',
        address: '456 Bình Long, Đồng Tháp',
        city: 'Đồng Tháp',
        region: 'Đồng bằng sông Cửu Long',
        capacity: 2000,
        status: 'active',
      },
    }),
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-VTNN-001' },
      update: {},
      create: {
        warehouseCode: 'KHO-VTNN-001',
        warehouseName: 'Kho Vật Tư Nông Nghiệp Trung Tâm',
        warehouseType: 'product',
        address: '789 Nông Nghiệp Vùng Cao, Lâm Đồng',
        city: 'Lâm Đồng',
        region: 'Tây Nguyên',
        capacity: 3000,
        status: 'active',
      },
    }),
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-NL-001' },
      update: {},
      create: {
        warehouseCode: 'KHO-NL-001',
        warehouseName: 'Kho Nguyên Liệu Trộn Phân Bón',
        warehouseType: 'raw_material',
        address: '101 Đường Công Nghiệp, Long An',
        city: 'Long An',
        region: 'Đồng bằng sông Cửu Long',
        capacity: 4000,
        status: 'active',
      },
    }),
  ]);

  console.log(`✅ Created ${warehouses.length} agricultural warehouses\n`);
  return warehouses;
}
