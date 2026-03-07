import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function main() {
  console.log('💵 Bắt đầu seed dữ liệu Công nợ Khách hàng (Debt Periods)...');

  // Xóa dữ liệu công nợ khách hàng cũ để tránh trùng lặp khi chạy lại lệnh seed nhiều lần
  await prisma.debtPeriod.deleteMany({
    where: { customerId: { not: null } },
  });

  // Lấy toàn bộ danh sách khách hàng hiện có trong DB
  const customers = await prisma.customer.findMany();

  if (customers.length === 0) {
    console.log('⚠️ Không tìm thấy khách hàng nào. Vui lòng chạy seed-customer trước!');
    return;
  }

  let count = 0;

  for (const customer of customers) {
    const currentDebt = Number(customer.currentDebt || 0);

    // KỊCH BẢN DỮ LIỆU:
    // Năm 2025: Nợ cuối kỳ = 40% của currentDebt hiện tại (đã khóa sổ)
    // Năm 2026: Nợ đầu kỳ = Nợ cuối 2025, phát sinh thêm để cuối kỳ = currentDebt (chưa khóa)
    
    const debt2025_closing = currentDebt * 0.4;
    
    // --- TẠO KỲ CÔNG NỢ 2025 ---
    const increasing2025 = currentDebt === 0 ? 5000000 : debt2025_closing * 2;
    const decreasing2025 = currentDebt === 0 ? 5000000 : increasing2025 - debt2025_closing;

    await prisma.debtPeriod.create({
      data: {
        customerId: customer.id,
        periodName: '2025',
        startTime: new Date('2025-01-01T00:00:00.000Z'),
        endTime: new Date('2025-12-31T23:59:59.000Z'),
        openingBalance: 0,
        increasingAmount: increasing2025,
        decreasingAmount: decreasing2025,
        returnAmount: 0,
        adjustmentAmount: 0,
        closingBalance: debt2025_closing,
        isLocked: true, // Đã chốt sổ năm cũ
        notes: 'Chốt công nợ cuối năm 2025',
      },
    });

    // --- TẠO KỲ CÔNG NỢ 2026 ---
    // Mua thêm lượng hàng trị giá bằng currentDebt, trả một phần sao cho số dư cuối bằng currentDebt
    const opening2026 = debt2025_closing;
    const increasing2026 = currentDebt === 0 ? 8000000 : currentDebt; 
    const decreasing2026 = currentDebt === 0 ? 8000000 : (opening2026 + increasing2026) - currentDebt;

    await prisma.debtPeriod.create({
      data: {
        customerId: customer.id,
        periodName: '2026',
        startTime: new Date('2026-01-01T00:00:00.000Z'),
        endTime: new Date('2026-12-31T23:59:59.000Z'),
        openingBalance: opening2026,
        increasingAmount: increasing2026,
        decreasingAmount: decreasing2026,
        returnAmount: 0,
        adjustmentAmount: 0,
        closingBalance: currentDebt,
        isLocked: false, // Kỳ hiện tại đang mở
        notes: 'Công nợ phát sinh năm 2026',
      },
    });

    count++;
  }

  console.log(`✅ Đã seed thành công 2 kỳ công nợ (2025 & 2026) cho ${count} khách hàng!`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed debt_periods:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });