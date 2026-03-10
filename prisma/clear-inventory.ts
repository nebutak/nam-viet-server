import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Xóa dữ liệu inventory và products...\n');

  try {
    // Xóa inventory trước (vì có foreign key)
    const deletedInventory = await prisma.inventory.deleteMany({});
    console.log(`✅ Đã xóa ${deletedInventory.count} inventory records`);

    // Xóa products
    const deletedProducts = await prisma.product.deleteMany({});
    console.log(`✅ Đã xóa ${deletedProducts.count} products`);

    console.log('\n✅ Xóa xong! Bây giờ bạn có thể chạy seed mới.');

  } catch (error) {
    console.error('❌ Lỗi:', error);
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
