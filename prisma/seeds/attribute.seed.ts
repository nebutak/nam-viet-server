import { PrismaClient } from '@prisma/client';

export async function seedAttributes(prisma: PrismaClient, adminUserId: number) {
  console.log('📝 Seeding attributes for agricultural products...');

  const attributes = await Promise.all([
    // Trọng lượng tịnh
    prisma.attribute.upsert({
      where: { id: 1 }, // Tạo fix ID hoặc dùng trường code nếu cần, nhưng code chưa set @unique. Dùng findFirst/create an toàn hơn
      update: {},
      create: {
        name: 'Trọng lượng tịnh',
        code: 'ATTR_NET_WEIGHT',
        dataType: 'number',
        unit: 'kg',
        description: 'Khối lượng tịnh của sản phẩm (không bao bì)',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    
    // Thể tích
    prisma.attribute.upsert({
      where: { id: 2 }, 
      update: {},
      create: {
        name: 'Thể tích thực',
        code: 'ATTR_VOLUME',
        dataType: 'number',
        unit: 'ml',
        description: 'Thể tích đối với các loại thuốc dạng lỏng',
        status: 'active',
        createdBy: adminUserId,
      },
    }),

    // Thành phần hoạt chất (Thuốc BVTV)
    prisma.attribute.upsert({
      where: { id: 3 }, 
      update: {},
      create: {
        name: 'Hoạt chất chính',
        code: 'ATTR_ACTIVE_ING',
        dataType: 'string',
        unit: '%',
        description: 'Thành phần hoạt chất trong thuốc bảo vệ thực vật',
        status: 'active',
        createdBy: adminUserId,
      },
    }),

    // Tỉ lệ N-P-K (Phân bón)
    prisma.attribute.upsert({
      where: { id: 4 }, 
      update: {},
      create: {
        name: 'Tỉ lệ N-P-K',
        code: 'ATTR_NPK_RATIO',
        dataType: 'string',
        unit: '',
        description: 'Tỉ lệ Đạm (N) - Lân (P) - Kali (K) trong phân bón',
        status: 'active',
        createdBy: adminUserId,
      },
    }),

    // Giai đoạn sử dụng
    prisma.attribute.upsert({
      where: { id: 5 }, 
      update: {},
      create: {
        name: 'Giai đoạn sử dụng',
        code: 'ATTR_USAGE_STAGE',
        dataType: 'string',
        unit: '',
        description: 'Giai đoạn sinh trưởng cây trồng nên dùng (Kích rễ, Nuôi trái...)',
        status: 'active',
        createdBy: adminUserId,
      },
    }),

    // Hình thức đóng gói
    prisma.attribute.upsert({
      where: { id: 6 }, 
      update: {},
      create: {
        name: 'Hình thức',
        code: 'ATTR_FORM',
        dataType: 'string',
        unit: '',
        description: 'Dạng viên, bột, hạt, lỏng...',
        status: 'active',
        createdBy: adminUserId,
      },
    }),
  ]);

  console.log(`✅ Created ${attributes.length} agricultural product attributes\n`);
  return attributes;
}
