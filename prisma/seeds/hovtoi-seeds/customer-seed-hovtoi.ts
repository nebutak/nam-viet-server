import { PrismaClient, CustomerType, Gender, CustomerStatus } from '@prisma/client';

export async function seedCustomers(prisma: PrismaClient) {
  console.log('🌱 Seeding Customers...');

  const creator = await prisma.user.findFirst();
  const creatorId = creator?.id || 1;

  // Xóa dữ liệu cũ nếu cần (tùy chọn, ở đây dùng skipDuplicates an toàn hơn)
  // await prisma.customer.deleteMany({});

  await prisma.customer.createMany({
    data: [
      {
        customerCode: 'CUS001',
        customerName: 'Nguyễn Văn An',
        customerType: CustomerType.individual,
        phone: '0901234567',
        email: 'nguyenvanan@example.com',
        address: '123 Đường Xuân Thủy, Cầu Giấy, Hà Nội',
        status: CustomerStatus.active,
        gender: Gender.male,
        createdBy: creatorId,
        creditLimit: 10000000,
        currentDebt: 0,
        rewardPoints: 100
      },
      {
        customerCode: 'CUS002',
        customerName: 'Công ty TNHH Nông Nghiệp Việt',
        customerType: CustomerType.company,
        phone: '0909876543',
        email: 'contact@nongnghiep.com',
        address: '456 Đường Nguyễn Trãi, Thanh Xuân, Hà Nội',
        taxCode: '0101234567',
        status: CustomerStatus.active,
        createdBy: creatorId,
        creditLimit: 50000000,
        currentDebt: 5000000,
        contactPerson: 'Trần Văn Bình'
      },
      {
        customerCode: 'CUS003',
        customerName: 'Trần Thị Cúc',
        customerType: CustomerType.individual,
        phone: '0912345678',
        email: 'tranthicuc@example.com',
        address: '789 Đường Lê Lợi, Quận 1, TP.HCM',
        status: CustomerStatus.active,
        gender: Gender.female,
        createdBy: creatorId,
        creditLimit: 5000000,
        currentDebt: 0
      },
      {
        customerCode: 'CUS004',
        customerName: 'Lê Hoàng Dũng',
        customerType: CustomerType.individual,
        phone: '0988112233',
        email: 'lehoangdung@example.com',
        address: '321 Đường Trần Hưng Đạo, Quận 5, TP.HCM',
        status: CustomerStatus.active,
        gender: Gender.male,
        createdBy: creatorId,
        creditLimit: 15000000,
        currentDebt: 2000000
      },
      {
        customerCode: 'CUS005',
        customerName: 'HTX Nông Nghiệp Xanh',
        customerType: CustomerType.company,
        phone: '02838123456',
        email: 'htx.xanh@example.com',
        address: 'Ấp 1, Xã Bình Chánh, Huyện Bình Chánh, TP.HCM',
        taxCode: '0311223344',
        status: CustomerStatus.active,
        createdBy: creatorId,
        creditLimit: 100000000,
        currentDebt: 10000000,
        contactPerson: 'Phạm Văn Em'
      }
    ],
    skipDuplicates: true
  });
  console.log('✅ Chèn khách hàng thành công!');
}
