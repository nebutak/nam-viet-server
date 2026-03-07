import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bắt đầu seed công nợ nhà cung cấp...\n');

  try {
    // Lấy tất cả nhà cung cấp
    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null },
      select: { id: true, supplierCode: true, supplierName: true }
    });

    if (suppliers.length === 0) {
      console.log('❌ Không tìm thấy nhà cung cấp nào!');
      return;
    }

    console.log(`📦 Tìm thấy ${suppliers.length} nhà cung cấp\n`);

    // Cập nhật công nợ ngẫu nhiên cho từng nhà cung cấp
    for (const supplier of suppliers) {
      // Tạo công nợ ngẫu nhiên từ 0 đến 50 triệu
      const randomDebt = Math.floor(Math.random() * 50000000);
      
      await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          totalPayable: randomDebt,
          payableUpdatedAt: new Date()
        }
      });

      console.log(`✅ ${supplier.supplierCode} - ${supplier.supplierName}: ${randomDebt.toLocaleString('vi-VN')} ₫`);
    }

    console.log('\n✅ Đã seed công nợ nhà cung cấp thành công!');

  } catch (error) {
    console.error('❌ Lỗi khi seed:', error);
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
