import { PrismaClient } from '@prisma/client';

export async function seedUnits(prisma: PrismaClient, adminUserId: number) {
  console.log('📝 Seeding units for agricultural supplies...');

  const units = await Promise.all([
    // Đơn vị khối lượng
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-KG' },
      update: {},
      create: {
        unitCode: 'UNIT-KG',
        unitName: 'Kilogram (Kg)',
        description: 'Đơn vị đo khối lượng chuẩn',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-GAM' },
      update: {},
      create: {
        unitCode: 'UNIT-GAM',
        unitName: 'Gram (g)',
        description: 'Đơn vị đo khối lượng nhỏ',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    
    // Đơn vị thể tích
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-LIT' },
      update: {},
      create: {
        unitCode: 'UNIT-LIT',
        unitName: 'Lít (L)',
        description: 'Đơn vị đo thể tích chuẩn',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-ML' },
      update: {},
      create: {
        unitCode: 'UNIT-ML',
        unitName: 'Mililit (ml)',
        description: 'Đơn vị đo thể tích nhỏ',
        status: 'active',
        createdBy: adminUserId,
      },
    }),

    // Đơn vị đóng gói
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-BAO' },
      update: {},
      create: {
        unitCode: 'UNIT-BAO',
        unitName: 'Bao',
        description: 'Đóng gói theo bao (thường dùng cho phân bón hạt)',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-CHAI' },
      update: {},
      create: {
        unitCode: 'UNIT-CHAI',
        unitName: 'Chai',
        description: 'Đóng gói chai (thường dùng thuốc nước)',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-GOI' },
      update: {},
      create: {
        unitCode: 'UNIT-GOI',
        unitName: 'Gói',
        description: 'Đóng gói theo gói nhỏ (thường dùng thuốc bột)',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-THUNG' },
      update: {},
      create: {
        unitCode: 'UNIT-THUNG',
        unitName: 'Thùng',
        description: 'Đóng gói lớn theo thùng',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.unit.upsert({
      where: { unitCode: 'UNIT-CAI' },
      update: {},
      create: {
        unitCode: 'UNIT-CAI',
        unitName: 'Cái / Chiếc',
        description: 'Đơn vị đếm thông dụng (dùng cho công cụ, vật tư)',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
  ]);

  console.log(`✅ Created ${units.length} agricultural units\n`);
  return units;
}
