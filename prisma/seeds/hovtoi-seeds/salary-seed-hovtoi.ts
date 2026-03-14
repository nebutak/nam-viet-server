import { PrismaClient, SalaryStatus, VoucherType, PaymentMethod } from '@prisma/client';

export async function seedSalary(prisma: PrismaClient) {
  console.log('🌱 Seeding Salary...');
  
  const creatorId = 1;
  const users = await prisma.user.findMany({ 
    take: 3,
    orderBy: { id: 'asc' }
  });

  if (users.length === 0) {
    console.log('⚠️ Missing Users to create salary.');
    return;
  }

  const today = new Date();
  const lastMonthDate = new Date(today);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const currentMonthStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthStr = `${lastMonthDate.getFullYear()}${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  for (const user of users) {
    // --- 1. Lương tháng trước (Đã trả) ---
    // Make sure month string unique constraint isn't violated
    const salaryLastMonth = await prisma.salary.upsert({
      where: {
        userId_month: {
          userId: user.id,
          month: lastMonthStr
        }
      },
      update: {},
      create: {
        userId: user.id,
        month: lastMonthStr,
        basicSalary: 10000000,
        allowance: 1000000,
        overtimePay: 500000,
        bonus: 0,
        commission: 2000000,
        deduction: 0,
        advance: 0,
        status: SalaryStatus.paid,
        isPosted: true,
        paymentDate: new Date(),
        createdBy: creatorId,
        approvedBy: creatorId,
        approvedAt: new Date(),
        paidBy: creatorId
      }
    });

    if (salaryLastMonth.status === SalaryStatus.paid && !salaryLastMonth.voucherId) {
       // Create Payment Voucher for salary
       const voucher = await prisma.paymentVoucher.create({
         data: {
           voucherCode: `PV-SALARY-${user.id}-${lastMonthStr}`,
           voucherType: VoucherType.salary,
           amount: Number(salaryLastMonth.basicSalary) + Number(salaryLastMonth.allowance) + 
                   Number(salaryLastMonth.overtimePay) + Number(salaryLastMonth.commission) + Number(salaryLastMonth.bonus) - 
                   Number(salaryLastMonth.deduction) - Number(salaryLastMonth.advance),
           paymentMethod: PaymentMethod.transfer,
           paymentDate: new Date(),
           isPosted: true,
           notes: `Thanh toán lương tháng ${lastMonthStr} cho nhân viên ID ${user.id}`,
           createdBy: creatorId,
           approvedBy: creatorId,
           approvedAt: new Date(),
         }
       });

       await prisma.salary.update({
         where: { id: salaryLastMonth.id },
         data: { voucherId: voucher.id }
       });
    }

    // --- 2. Lương tháng này (Mới tính - Chờ duyệt / pending) ---
    const isSpecialBoy = user.id === users[0].id; // Test 1 bạn có advance (tạm ứng)
    await prisma.salary.upsert({
      where: {
        userId_month: {
          userId: user.id,
          month: currentMonthStr
        }
      },
      update: {},
      create: {
        userId: user.id,
        month: currentMonthStr,
        basicSalary: 10000000,
        allowance: 1000000,
        overtimePay: 0,
        bonus: 500000, // Thưởng chuyên cần
        commission: 500000,
        deduction: isSpecialBoy ? 0 : 200000, // Phạt đi trễ
        advance: isSpecialBoy ? 3000000 : 0, // Tạm ứng
        status: SalaryStatus.pending,
        isPosted: false,
        createdBy: creatorId,
      }
    });
  }

  console.log('✅ Created Salary records for last month (Paid) and this month (Pending).');
}
