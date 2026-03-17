import { PrismaClient } from '@prisma/client';

export async function seedProducts(prisma: PrismaClient, adminUserId: number) {
  console.log('📝 Seeding products for agricultural supplies...');

  // 1. Lấy reference IDs (Dựa trên categoryCode, supplierCode, unitCode đã tạo ở các file trước)
  const catPBNPK = await prisma.category.findUnique({ where: { categoryCode: 'CAT-PB-NPK' } });
  const catPBHC = await prisma.category.findUnique({ where: { categoryCode: 'CAT-PB-HC' } });
  const catTBVTVSau = await prisma.category.findUnique({ where: { categoryCode: 'CAT-TBVTV-SAU' } });
  const catTBVTVBenh = await prisma.category.findUnique({ where: { categoryCode: 'CAT-TBVTV-BENH' } });
  const catVTNNDc = await prisma.category.findUnique({ where: { categoryCode: 'CAT-VTNN-DC' } });

  // Material categories
  const catPlastic = await prisma.category.findUnique({ where: { categoryCode: 'MCAT-PLASTIC' } });
  const catChemical = await prisma.category.findUnique({ where: { categoryCode: 'MCAT-CHEMICAL' } });

  const supBinhDien = await prisma.supplier.findUnique({ where: { supplierCode: 'NCC-PB-001' } });
  const supDucGiang = await prisma.supplier.findUnique({ where: { supplierCode: 'NCC-PB-002' } });
  const supHai = await prisma.supplier.findUnique({ where: { supplierCode: 'NCC-TBVTV-001' } });
  const supLocTroi = await prisma.supplier.findUnique({ where: { supplierCode: 'NCC-TBVTV-002' } });
  const supPlasticVN = await prisma.supplier.findUnique({ where: { supplierCode: 'NCC-VT-002' } });

  const unitBao = await prisma.unit.findUnique({ where: { unitCode: 'UNIT-BAO' } });
  const unitChai = await prisma.unit.findUnique({ where: { unitCode: 'UNIT-CHAI' } });
  const unitCai = await prisma.unit.findUnique({ where: { unitCode: 'UNIT-CAI' } });
  const unitKg = await prisma.unit.findUnique({ where: { unitCode: 'UNIT-KG' } });

  // Lấy ID thuế (ví dụ VAT 5% cho phân bón, 10% cho thuốc BVTV, Không chịu thuế cho vật tư)
  const tax5 = await prisma.tax.findFirst({ where: { percentage: 5 } });
  const tax10 = await prisma.tax.findFirst({ where: { percentage: 10 } });
  const tax0 = await prisma.tax.findFirst({ where: { title: 'Không chịu thuế' } });

  // 2. Tạo danh sách sản phẩm mẫu
  const products = await Promise.all([
    // Phân bón
    prisma.product.upsert({
      where: { code: 'SP-PB-001' },
      update: {},
      create: {
        code: 'SP-PB-001',
        productName: 'Phân bón Đầu Trâu NPK 20-20-15',
        type: 'PRODUCT',
        categoryId: catPBNPK?.id,
        supplierId: supBinhDien?.id,
        unitId: unitBao?.id,
        description: 'Phân bón NPK cao cấp, giúp cây sinh trưởng mạnh, trổ bông đều',
        basePrice: 500000,
        price: 550000,
        taxIds: tax5 ? [tax5.id] : [],
        minStockLevel: 50,
        hasExpiry: false,
        manageSerial: false,
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.product.upsert({
      where: { code: 'SP-PB-002' },
      update: {},
      create: {
        code: 'SP-PB-002',
        productName: 'Phân bón hữu cơ sinh học Đầu Trâu',
        type: 'PRODUCT',
        categoryId: catPBHC?.id,
        supplierId: supBinhDien?.id,
        unitId: unitBao?.id,
        description: 'Phân bón hữu cơ giúp cải tạo đất, tăng độ phì nhiêu',
        basePrice: 350000,
        price: 380000,
        taxIds: tax5 ? [tax5.id] : [],
        minStockLevel: 30,
        hasExpiry: false,
        manageSerial: false,
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    
    // Thuốc BVTV
    prisma.product.upsert({
      where: { code: 'SP-TBVTV-001' },
      update: {},
      create: {
        code: 'SP-TBVTV-001',
        productName: 'Thuốc trừ sâu sinh học Radiant 60SC',
        type: 'PRODUCT',
        categoryId: catTBVTVSau?.id,
        supplierId: supLocTroi?.id,
        unitId: unitChai?.id,
        description: 'Thuốc đặc trị bọ trĩ, sâu cuốn lá, sâu đục thân trên lúa và rau màu',
        basePrice: 120000,
        price: 135000,
        taxIds: tax10 ? [tax10.id] : [],
        minStockLevel: 100,
        hasExpiry: true,
        manageSerial: true,
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.product.upsert({
      where: { code: 'SP-TBVTV-002' },
      update: {},
      create: {
        code: 'SP-TBVTV-002',
        productName: 'Thuốc trừ nấm bệnh Anvil 5SC',
        type: 'PRODUCT',
        categoryId: catTBVTVBenh?.id,
        supplierId: supHai?.id,
        unitId: unitChai?.id,
        description: 'Thuốc trừ nấm phổ rộng, phòng trừ nhiều loại bệnh trên cây trồng',
        basePrice: 90000,
        price: 110000,
        taxIds: tax10 ? [tax10.id] : [],
        minStockLevel: 80,
        hasExpiry: true,
        manageSerial: true,
        status: 'active',
        createdBy: adminUserId,
      },
    }),

    // Vật tư nông nghiệp
    prisma.product.upsert({
      where: { code: 'SP-VTNN-001' },
      update: {},
      create: {
        code: 'SP-VTNN-001',
        productName: 'Kéo cắt cành mũi hớt Asaki',
        type: 'PRODUCT',
        categoryId: catVTNNDc?.id,
        supplierId: supDucGiang?.id, // Tạm gán
        unitId: unitCai?.id,
        description: 'Kéo cắt cành chuyên dụng, lưỡi thép sắc bén',
        basePrice: 150000,
        price: 180000,
        taxIds: tax0 ? [tax0.id] : [],
        minStockLevel: 20,
        hasExpiry: false,
        manageSerial: false,
        status: 'active',
        createdBy: adminUserId,
      },
    }),

    // --- Nguyên liệu (Materials) ---
    prisma.product.upsert({
      where: { code: 'MAT-PL-001' },
      update: {},
      create: {
        code: 'MAT-PL-001',
        productName: 'Hạt nhựa PE nguyên sinh',
        type: 'MATERIAL',
        categoryId: catPlastic?.id,
        supplierId: supPlasticVN?.id,
        unitId: unitKg?.id,
        description: 'Hạt nhựa PE dùng để thổi túi nilon, màng phủ nông nghiệp',
        basePrice: 45000,
        price: 48000,
        taxIds: tax10 ? [tax10.id] : [],
        minStockLevel: 1000,
        hasExpiry: false,
        manageSerial: false,
        status: 'active',
        createdBy: adminUserId,
      },
    }),
    prisma.product.upsert({
      where: { code: 'MAT-CH-001' },
      update: {},
      create: {
        code: 'MAT-CH-001',
        productName: 'Dung môi pha chế thuốc BVTV',
        type: 'MATERIAL',
        categoryId: catChemical?.id,
        supplierId: supLocTroi?.id, // Tạm gán
        unitId: unitChai?.id,
        description: 'Dung môi chuyên dụng cho ngành nông dược',
        basePrice: 85000,
        price: 95000,
        taxIds: tax10 ? [tax10.id] : [],
        minStockLevel: 200,
        hasExpiry: true,
        manageSerial: false,
        status: 'active',
        createdBy: adminUserId,
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} agricultural products\n`);
  return products;
}
