import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedProductMedia() {
  console.log('🌱 Product Images & Videos tables removed - using single image field in Product model');
  console.log('✅ Skipping media seeding');
}

seedProductMedia()
  .catch((e) => {
    console.error('❌ Lỗi khi seed ProductMedia:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
