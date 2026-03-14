import { PrismaClient, AttendanceStatus, LeaveType, ShiftType } from '@prisma/client';

export async function seedAttendance(prisma: PrismaClient) {
  console.log('🌱 Seeding Attendance...');
  
  const creatorId = 1;
  const users = await prisma.user.findMany({ 
    take: 3,
    orderBy: { id: 'asc' }
  });

  if (users.length === 0) {
    console.log('⚠️ Missing Users to create attendance.');
    return;
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // --- Chấm công Hôm qua (Đã hoàn thành) ---
  for (const user of users) {
    const checkIn = new Date(yesterday);
    checkIn.setHours(8, 0, 0, 0); // 8:00 AM

    const checkOut = new Date(yesterday);
    checkOut.setHours(17, 30, 0, 0); // 5:30 PM

    // Add some random minutes for realism
    checkIn.setMinutes(Math.floor(Math.random() * 15));
    checkOut.setMinutes(30 + Math.floor(Math.random() * 15));

    await prisma.attendance.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: yesterday
        }
      },
      update: {},
      create: {
        userId: user.id,
        date: yesterday,
        checkInTime: checkIn,
        checkOutTime: checkOut,
        status: AttendanceStatus.present,
        shift: ShiftType.all_day,
        checkInLocation: '123 IP Address / Office location',
        checkOutLocation: '123 IP Address / Office location',
        approvedBy: creatorId,
        approvedAt: new Date()
      }
    });
  }

  // --- Chấm công Hôm nay (Mới check-in, chưa check-out) ---
  for (const user of users) {
    const checkIn = new Date(today);
    checkIn.setHours(8, 0, 0, 0); 
    checkIn.setMinutes(Math.floor(Math.random() * 10));

    // Thử 1 nhân viên vắng mặt
    const isAbsent = user.id === users[users.length - 1].id;

    await prisma.attendance.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: today
        }
      },
      update: {},
      create: {
        userId: user.id,
        date: today,
        checkInTime: isAbsent ? null : checkIn,
        checkOutTime: null,
        status: isAbsent ? AttendanceStatus.absent : AttendanceStatus.present,
        leaveType: isAbsent ? LeaveType.annual : LeaveType.none,
        shift: ShiftType.all_day,
        checkInLocation: isAbsent ? null : '123 IP Address / Office location',
        notes: isAbsent ? 'Xin nghỉ phép định kỳ hàng tháng' : null
      }
    });
  }

  console.log('✅ Created Attendance logs for yesterday and today.');
}
