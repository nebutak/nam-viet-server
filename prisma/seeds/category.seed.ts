import { PrismaClient } from '@prisma/client';

export async function seedCategories(prisma: PrismaClient) {
  console.log('📝 Seeding categories for agricultural supplies...');

  // 1. Danh mục cha
  const parentCategories = [
    { code: 'CAT-PB', name: 'Phân bón' },
    { code: 'CAT-TBVTV', name: 'Thuốc bảo vệ thực vật' },
    { code: 'CAT-VTNN', name: 'Vật tư nông nghiệp' }
  ];

  const parentMap: Record<string, number> = {};

  for (const pc of parentCategories) {
    const parent = await prisma.category.upsert({
      where: { categoryCode: pc.code },
      update: { categoryName: pc.name },
      create: {
        categoryCode: pc.code,
        categoryName: pc.name,
        status: 'active',
      },
    });
    parentMap[pc.code] = parent.id;
  }

  // 2. Danh mục con
  const childCategories = [
    // Phân bón
    { code: 'CAT-PB-NPK', name: 'Phân bón NPK (Vô cơ)', parentCode: 'CAT-PB' },
    { code: 'CAT-PB-HC', name: 'Phân bón Hữu cơ, Vi sinh', parentCode: 'CAT-PB' },
    { code: 'CAT-PB-LA', name: 'Phân bón lá, Vi lượng', parentCode: 'CAT-PB' },
    
    // Thuốc BVTV
    { code: 'CAT-TBVTV-SAU', name: 'Thuốc trừ sâu, nhện', parentCode: 'CAT-TBVTV' },
    { code: 'CAT-TBVTV-BENH', name: 'Thuốc trừ nấm, vi khuẩn', parentCode: 'CAT-TBVTV' },
    { code: 'CAT-TBVTV-CO', name: 'Thuốc trừ cỏ', parentCode: 'CAT-TBVTV' },
    { code: 'CAT-TBVTV-DHST', name: 'Thuốc kích thích sinh trưởng, Kích thích ra hoa', parentCode: 'CAT-TBVTV' },
    { code: 'CAT-TBVTV-OC', name: 'Thuốc trừ ốc, diệt chuột', parentCode: 'CAT-TBVTV' },
    
    // Vật tư nông nghiệp
    { code: 'CAT-VTNN-DC', name: 'Dụng cụ làm vườn, Cắt tỉa cành', parentCode: 'CAT-VTNN' },
    { code: 'CAT-VTNN-BAO', name: 'Bao bọc trái cây, Túi lưới', parentCode: 'CAT-VTNN' },
    { code: 'CAT-VTNN-TUOI', name: 'Vật tư hệ thống tưới', parentCode: 'CAT-VTNN' },
    { code: 'CAT-VTNN-BAT', name: 'Bạt phủ đất, Xơ dừa, Chậu trồng', parentCode: 'CAT-VTNN' },
  ];

  for (const cc of childCategories) {
    await prisma.category.upsert({
      where: { categoryCode: cc.code },
      update: { 
        categoryName: cc.name,
        parentId: parentMap[cc.parentCode],
        status: 'active'
      },
      create: {
        categoryCode: cc.code,
        categoryName: cc.name,
        status: 'active',
        parentId: parentMap[cc.parentCode],
      },
    });
  }

  const count = await prisma.category.count();
  console.log(`✅ Seeded ${count} agricultural categories.\n`);
}
