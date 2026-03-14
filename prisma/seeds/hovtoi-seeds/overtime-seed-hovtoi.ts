import { PrismaClient, OvertimeSessionStatus } from '@prisma/client';

export async function seedOvertime(prisma: PrismaClient) {
  console.log('🌱 Seeding Overtime...');
  
  const creatorId = 1;
  const users = await prisma.user.findMany({ 
    take: 2,
    orderBy: { id: 'asc' }
  });

  if (users.length === 0) {
    console.log('⚠️ Missing Users to create overtime.');
    return;
  }

  const today = new Date();
  const sessionStart = new Date(today);
  sessionStart.setHours(18, 0, 0, 0); // Bắt đầu tăng ca 6:00 PM
  
  const sessionEnd = new Date(today);
  sessionEnd.setHours(21, 0, 0, 0); // Kết thúc 9:00 PM

  // --- Tạo Overtime Session (Yêu cầu tăng ca) ---
  const session = await prisma.overtimeSession.create({
    data: {
      sessionName: 'Tăng ca dự án cuối tháng',
      startTime: sessionStart,
      endTime: sessionEnd,
      status: OvertimeSessionStatus.closed, // Đã đóng và chốt sổ
      notes: 'Gấp rút hoàn thiện đơn hàng cho khách',
      createdBy: creatorId,
      entries: {
        create: users.map(user => {
          // Add some variance in actual time
          const start = new Date(sessionStart);
          start.setMinutes(Math.floor(Math.random() * 10)); // Trễ vài phút
          
          const end = new Date(sessionEnd);
          end.setMinutes(Math.floor(Math.random() * 10) - 5); // Tùy lúc nghỉ

          // Tính toán số giờ thực tế (VD: 3 tiếng = 3.0)
          const diffMs = end.getTime() - start.getTime();
          const actualHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

          return {
            userId: user.id,
            startTime: start,
            endTime: end,
            actualHours: actualHours,
            notes: 'Hoàn thành tốt nhiệm vụ'
          };
        })
      }
    }
  });

  console.log(`✅ Created Overtime Session (ID: ${session.id}) with ${users.length} entries.`);
}
