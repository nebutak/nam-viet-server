import { PrismaClient } from '@prisma/client';

export async function seedWarehouses(prisma: PrismaClient) {
  console.log('📦 Seeding warehouses...');

  const warehouses = await Promise.all([
    // Kho chính - Trung tâm phân phối
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-CHINH-001' },
      update: {},
      create: {
        warehouseCode: 'KHO-CHINH-001',
        warehouseName: 'Kho Trung Tâm - Hồ Chí Minh',
        warehouseType: 'product',
        address: '123 Đường Nguyễn Văn Linh, Quận 7',
        city: 'Hồ Chí Minh',
        region: 'Miền Nam',
        description: 'Kho trung tâm chính, phân phối toàn quốc',
        capacity: 10000,
        status: 'active',
      },
    }),

    // Kho thành phẩm
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-TP-HN' },
      update: {},
      create: {
        warehouseCode: 'KHO-TP-HN',
        warehouseName: 'Kho Thành Phẩm Hà Nội',
        warehouseType: 'product',
        address: '456 Đường Giải Phóng, Hoàng Mai',
        city: 'Hà Nội',
        region: 'Miền Bắc',
        description: 'Kho thành phẩm khu vực miền Bắc',
        capacity: 5000,
        status: 'active',
      },
    }),

    // Kho thành phẩm miền Trung
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-TP-DN' },
      update: {},
      create: {
        warehouseCode: 'KHO-TP-DN',
        warehouseName: 'Kho Thành Phẩm Đà Nẵng',
        warehouseType: 'product',
        address: '789 Đường Nguyễn Tất Thành, Liên Chiểu',
        city: 'Đà Nẵng',
        region: 'Miền Trung',
        description: 'Kho thành phẩm khu vực miền Trung',
        capacity: 3000,
        status: 'active',
      },
    }),

    // Kho nguyên liệu
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-NL-001' },
      update: {},
      create: {
        warehouseCode: 'KHO-NL-001',
        warehouseName: 'Kho Nguyên Liệu Bình Dương',
        warehouseType: 'raw_material',
        address: '101 Đường Mỹ Phước Tân Vạn, Bình Dương',
        city: 'Bình Dương',
        region: 'Miền Nam',
        description: 'Kho lưu trữ nguyên liệu thô',
        capacity: 8000,
        status: 'active',
      },
    }),

    // Kho chi nhánh
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-CN-CT' },
      update: {},
      create: {
        warehouseCode: 'KHO-CN-CT',
        warehouseName: 'Kho Chi Nhánh Cần Thơ',
        warehouseType: 'product',
        address: '234 Đường 3/2, Ninh Kiều',
        city: 'Cần Thơ',
        region: 'Đồng bằng sông Cửu Long',
        description: 'Kho chi nhánh phục vụ khu vực ĐBSCL',
        capacity: 2000,
        status: 'active',
      },
    }),

    // Kho tạm thời (có thể inactive)
    prisma.warehouse.upsert({
      where: { warehouseCode: 'KHO-TT-001' },
      update: {},
      create: {
        warehouseCode: 'KHO-TT-001',
        warehouseName: 'Kho Tạm Thời - Quận 12',
        warehouseType: 'product',
        address: '567 Quốc Lộ 1A, Quận 12',
        city: 'Hồ Chí Minh',
        region: 'Miền Nam',
        description: 'Kho tạm thời cho hàng chờ xuất',
        capacity: 1000,
        status: 'inactive',
      },
    }),
  ]);

  console.log(`✅ Created ${warehouses.length} warehouses`);
  console.log('   - Active warehouses:', warehouses.filter(w => w.status === 'active').length);
  console.log('   - Product warehouses:', warehouses.filter(w => w.warehouseType === 'product').length);
  console.log('   - Raw material warehouses:', warehouses.filter(w => w.warehouseType === 'raw_material').length);
  console.log('');
  
  return warehouses;
}
