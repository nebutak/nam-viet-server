import { PrismaClient } from '@prisma/client';

export async function seedTaxes(prisma: PrismaClient, adminUserId: number) {
  console.log('📝 Seeding taxes for agricultural supplies...');

  // Lưu ý: Prisma DB sử dụng unique constraint hoặc tìm kiếm theo title để tránh duplicate.
  // Vì bảng Tax không có trường nào mang tính unique cụ thể (như mã code) ngoài ID tự tăng,
  // chúng ta có thể check existed dựa trên `title` và `percentage`.
  
  const taxData = [
    { title: 'VAT 0%', percentage: 0, priority: 1, status: 'active' },
    { title: 'VAT 5%', percentage: 5, priority: 2, status: 'active' },
    { title: 'VAT 8%', percentage: 8, priority: 3, status: 'active' },
    { title: 'VAT 10%', percentage: 10, priority: 4, status: 'active' },
    { title: 'Không chịu thuế', percentage: 0, priority: 5, status: 'active' },
  ];

  const taxes = [];

  for (const t of taxData) {
    // Tìm thuế xem đã có chưa
    const existingTax = await prisma.tax.findFirst({
      where: { title: t.title, percentage: t.percentage }
    });

    if (existingTax) {
      const updated = await prisma.tax.update({
        where: { id: existingTax.id },
        data: { 
          priority: t.priority,
          status: t.status,
          updatedBy: adminUserId
        }
      });
      taxes.push(updated);
    } else {
      const created = await prisma.tax.create({
        data: {
          title: t.title,
          percentage: t.percentage,
          priority: t.priority,
          status: t.status,
          createdBy: adminUserId,
        }
      });
      taxes.push(created);
    }
  }

  console.log(`✅ Created/Updated ${taxes.length} agricultural taxes\n`);
  return taxes;
}
