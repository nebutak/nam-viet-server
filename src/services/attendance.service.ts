import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import { importAttendanceFromFile } from '@utils/attendance-import';
import {
  AttendanceQueryInput,
  CheckInInput,
  CheckOutInput,
  UpdateAttendanceInput,
  RequestLeaveInput,
} from '@validators/attendance.validator';

const prisma = new PrismaClient();

// Working hours configuration
const STANDARD_START_TIME = '08:30:00'; // 8:30 AM
const STANDARD_WORK_HOURS = 8;
const LUNCH_BREAK_HOURS = 1;

class AttendanceService {
  // Calculate work hours between check-in and check-out
  private calculateWorkHours(checkInTime: Date, checkOutTime: Date): number {
    const diffMs = checkOutTime.getTime() - checkInTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Subtract lunch break if worked more than 4 hours
    const workHours = diffHours > 4 ? diffHours - LUNCH_BREAK_HOURS : diffHours;

    return Math.max(0, Math.round(workHours * 100) / 100);
  }

  // Calculate overtime hours
  private calculateOvertimeHours(workHours: number): number {
    return Math.max(0, workHours - STANDARD_WORK_HOURS);
  }

  // Check if check-in is late (after 8:30 AM)
  private isLate(checkInTime: Date): boolean {
    const hours = checkInTime.getHours();
    const minutes = checkInTime.getMinutes();
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:00`;
    return timeString > STANDARD_START_TIME;
  }

  // Get all attendance records with filters
  async getAll(params: AttendanceQueryInput) {
    const {
      page = '1',
      limit = '20',
      userId,
      status,
      leaveType,
      fromDate,
      toDate,
      month,
      sortBy = 'date',
      sortOrder = 'desc',
    } = params;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.AttendanceWhereInput = {
      ...(userId && { userId }),
      ...(status && { status }),
      ...(leaveType && { leaveType }),
      ...(fromDate &&
        toDate && {
          date: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
      ...(month && {
        date: {
          gte: new Date(`${month.substring(0, 4)}-${month.substring(4, 6)}-01`),
          lt: new Date(
            new Date(`${month.substring(0, 4)}-${month.substring(4, 6)}-01`).getFullYear(),
            new Date(`${month.substring(0, 4)}-${month.substring(4, 6)}-01`).getMonth() + 1,
            1
          ),
        },
      }),
    };

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              email: true,
            },
          },
          approver: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
        },
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.attendance.count({ where }),
    ]);

    return {
      data: records,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  // Get attendance by ID
  async getById(id: number) {
    const attendance = await prisma.attendance.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundError('Hồ sơ chấm công không tồn tại');
    }

    return attendance;
  }

  // Get my attendance records
  async getMyAttendance(userId: number, params: AttendanceQueryInput) {
    return this.getAll({ ...params, userId });
  }

  // Check-in
  async checkIn(userId: number, data: CheckInInput) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existing = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (existing && existing.checkInTime) {
      throw new ConflictError('Đã chấm công vào hôm nay');
    }

    const now = new Date();
    const late = this.isLate(now);

    const attendance = await prisma.attendance.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      update: {
        checkInTime: now,
        status: late ? 'late' : 'present',
        checkInLocation: data.checkInLocation,
        notes: data.notes,
      },
      create: {
        userId,
        date: today,
        checkInTime: now,
        status: late ? 'late' : 'present',
        checkInLocation: data.checkInLocation,
        notes: data.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    // Log activity
    logActivity('check_in', userId, 'attendance', {
      id: attendance.id,
      date: today,
      status: attendance.status,
    });

    return attendance;
  }

  // Check-out
  async checkOut(userId: number, data: CheckOutInput) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('Không tìm thấy hồ sơ chấm công hôm nay');
    }

    if (existing.checkOutTime) {
      throw new ConflictError('Đã chấm công ra hôm nay');
    }

    if (!existing.checkInTime) {
      throw new ValidationError('Phải chấm công vào trước khi chấm công ra');
    }

    const now = new Date();
    const checkInDateTime = new Date(today);
    const checkInParts = existing.checkInTime.toString().split(':');
    checkInDateTime.setHours(
      parseInt(checkInParts[0]),
      parseInt(checkInParts[1]),
      parseInt(checkInParts[2] || '0')
    );

    const workHours = this.calculateWorkHours(checkInDateTime, now);
    const overtimeHours = this.calculateOvertimeHours(workHours);

    const attendance = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOutTime: now,
        overtimeHours,
        checkOutLocation: data.checkOutLocation,
        notes: data.notes || existing.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    // Log activity
    logActivity('check_out', userId, 'attendance', {
      id: attendance.id,
      workHours,
      overtimeHours,
    });

    return {
      ...attendance,
      workHours,
    };
  }

  // Update attendance (Admin only)
  async update(id: number, data: UpdateAttendanceInput, adminId: number) {
    const existing = await prisma.attendance.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Hồ sơ chấm công không tồn tại');
    }

    // If updating times, recalculate work hours and overtime
    let overtimeHours = data.overtimeHours;

    if (data.checkInTime && data.checkOutTime) {
      const date = new Date(existing.date);
      const checkIn = new Date(date);
      const checkOut = new Date(date);

      const [inH, inM, inS] = data.checkInTime.split(':').map(Number);
      const [outH, outM, outS] = data.checkOutTime.split(':').map(Number);

      checkIn.setHours(inH, inM, inS);
      checkOut.setHours(outH, outM, outS);

      const workHours = this.calculateWorkHours(checkIn, checkOut);
      overtimeHours = this.calculateOvertimeHours(workHours);
    }

    const attendance = await prisma.attendance.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.leaveType && { leaveType: data.leaveType }),
        ...(data.checkInTime && { checkInTime: data.checkInTime }),
        ...(data.checkOutTime && { checkOutTime: data.checkOutTime }),
        ...(overtimeHours !== undefined && { overtimeHours }),
        ...(data.checkInLocation && { checkInLocation: data.checkInLocation }),
        ...(data.checkOutLocation && { checkOutLocation: data.checkOutLocation }),
        ...(data.notes && { notes: data.notes }),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    // Log activity
    logActivity('update', adminId, 'attendance', {
      id,
      changes: Object.keys(data),
    });

    return attendance;
  }

  // Request leave
  async requestLeave(userId: number, data: RequestLeaveInput) {
    const leaveDate = new Date(data.date);
    leaveDate.setHours(0, 0, 0, 0);

    // Check if already has attendance for this date
    const existing = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId,
          date: leaveDate,
        },
      },
    });

    if (existing) {
      throw new ConflictError('Hồ sơ chấm công đã tồn tại cho ngày này');
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        date: leaveDate,
        status: 'leave',
        leaveType: data.leaveType,
        shift: data.shift || 'all_day',
        notes: data.reason,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    // Log activity
    logActivity('request_leave', userId, 'attendance', {
      id: attendance.id,
      leaveType: data.leaveType,
      date: leaveDate,
    });

    return attendance;
  }

  // Approve/Reject leave
  async approveLeave(id: number, approved: boolean, approverId: number, notes?: string) {
    const existing = await prisma.attendance.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Hồ sơ chấm công không tồn tại');
    }

    if (existing.status !== 'leave') {
      throw new ValidationError('Chỉ các yêu cầu nghỉ phép mới có thể được phê duyệt');
    }

    const attendance = await prisma.attendance.update({
      where: { id },
      data: {
        approvedBy: approverId,
        approvedAt: new Date(),
        ...(notes && { notes }),
        ...(approved ? {} : { status: 'absent', leaveType: 'none' }),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    // Log activity
    logActivity(approved ? 'approve_leave' : 'reject_leave', approverId, 'attendance', {
      id,
      userId: existing.userId,
    });

    return attendance;
  }

  // Get monthly report
  async getMonthlyReport(month: string, userId?: number) {
    const year = parseInt(month.substring(0, 4));
    const monthNum = parseInt(month.substring(4, 6));

    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0); // Last day of month

    const where: Prisma.AttendanceWhereInput = {
      date: {
        gte: startDate,
        lte: endDate,
      },
      ...(userId && { userId }),
    };

    const records = await prisma.attendance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    // Group by user
    const userRecords = records.reduce((acc, record) => {
      const key = record.userId;
      if (!acc[key]) {
        acc[key] = {
          user: record.user,
          records: [],
          summary: {
            totalDays: 0,
            presentDays: 0,
            lateDays: 0,
            absentDays: 0,
            leaveDays: 0,
            wfhDays: 0,
            totalWorkHours: 0,
            totalOvertimeHours: 0,
          },
        };
      }

      acc[key].records.push(record);

      // Update summary
      const summary = acc[key].summary;
      summary.totalDays++;

      switch (record.status) {
        case 'present':
          summary.presentDays++;
          break;
        case 'late':
          summary.lateDays++;
          summary.presentDays++;
          break;
        case 'absent':
          summary.absentDays++;
          break;
        case 'leave':
          // If shift is morning or afternoon, count as 0.5
          if (['morning', 'afternoon'].includes(record.shift as string)) {
             summary.leaveDays += 0.5;
          } else {
             summary.leaveDays += 1;
          }
          break;
        case 'work_from_home':
          summary.wfhDays++;
          summary.presentDays++;
          break;
      }

      // Calculate work hours
      if (record.checkInTime && record.checkOutTime) {
        const checkInDateTime = new Date(record.date);
        const checkInParts = record.checkInTime.toString().split(':');
        checkInDateTime.setHours(
          parseInt(checkInParts[0]),
          parseInt(checkInParts[1]),
          parseInt(checkInParts[2] || '0')
        );

        const checkOutDateTime = new Date(record.date);
        const checkOutParts = record.checkOutTime.toString().split(':');
        checkOutDateTime.setHours(
          parseInt(checkOutParts[0]),
          parseInt(checkOutParts[1]),
          parseInt(checkOutParts[2] || '0')
        );

        const workHours = this.calculateWorkHours(checkInDateTime, checkOutDateTime);
        summary.totalWorkHours += workHours;
      }

      summary.totalOvertimeHours += Number(record.overtimeHours);

      return acc;
    }, {} as Record<number, any>);

    return {
      month,
      startDate,
      endDate,
      users: Object.values(userRecords),
    };
  }

  // Delete attendance record
  async delete(id: number, adminId: number) {
    const existing = await prisma.attendance.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Hồ sơ chấm công không tồn tại');
    }

    await prisma.attendance.delete({
      where: { id },
    });

    // Log activity
    logActivity('delete', adminId, 'attendance', {
      id,
      userId: existing.userId,
      date: existing.date,
    });

    return { message: 'Hồ sơ chấm công đã bị xóa' };
  }

  // Get attendance statistics for a user in a period
  async getUserStatistics(userId: number, fromDate: Date, toDate: Date) {
    const records = await prisma.attendance.findMany({
      where: {
        userId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
    });

    const stats = {
      totalDays: records.length,
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      leaveDays: 0,
      wfhDays: 0,
      totalWorkHours: 0,
      totalOvertimeHours: 0,
      averageCheckInTime: '',
      averageCheckOutTime: '',
    };

    let totalCheckInMinutes = 0;
    let totalCheckOutMinutes = 0;
    let checkInCount = 0;
    let checkOutCount = 0;

    records.forEach((record) => {
      switch (record.status) {
        case 'present':
          stats.presentDays++;
          break;
        case 'late':
          stats.lateDays++;
          stats.presentDays++;
          break;
        case 'absent':
          stats.absentDays++;
          break;
        case 'leave':
          stats.leaveDays++;
          break;
        case 'work_from_home':
          stats.wfhDays++;
          stats.presentDays++;
          break;
      }

      stats.totalOvertimeHours += Number(record.overtimeHours);

      // Calculate average check-in/out times
      if (record.checkInTime) {
        const parts = record.checkInTime.toString().split(':');
        totalCheckInMinutes += parseInt(parts[0]) * 60 + parseInt(parts[1]);
        checkInCount++;
      }

      if (record.checkOutTime) {
        const parts = record.checkOutTime.toString().split(':');
        totalCheckOutMinutes += parseInt(parts[0]) * 60 + parseInt(parts[1]);
        checkOutCount++;
      }

      // Calculate work hours if both check-in and check-out exist
      if (record.checkInTime && record.checkOutTime) {
        const checkInDateTime = new Date(record.date);
        const checkInParts = record.checkInTime.toString().split(':');
        checkInDateTime.setHours(
          parseInt(checkInParts[0]),
          parseInt(checkInParts[1]),
          parseInt(checkInParts[2] || '0')
        );

        const checkOutDateTime = new Date(record.date);
        const checkOutParts = record.checkOutTime.toString().split(':');
        checkOutDateTime.setHours(
          parseInt(checkOutParts[0]),
          parseInt(checkOutParts[1]),
          parseInt(checkOutParts[2] || '0')
        );

        stats.totalWorkHours += this.calculateWorkHours(checkInDateTime, checkOutDateTime);
      }
    });

    // Calculate average times
    if (checkInCount > 0) {
      const avgMinutes = Math.floor(totalCheckInMinutes / checkInCount);
      const hours = Math.floor(avgMinutes / 60);
      const mins = avgMinutes % 60;
      stats.averageCheckInTime = `${hours.toString().padStart(2, '0')}:${mins
        .toString()
        .padStart(2, '0')}`;
    }

    if (checkOutCount > 0) {
      const avgMinutes = Math.floor(totalCheckOutMinutes / checkOutCount);
      const hours = Math.floor(avgMinutes / 60);
      const mins = avgMinutes % 60;
      stats.averageCheckOutTime = `${hours.toString().padStart(2, '0')}:${mins
        .toString()
        .padStart(2, '0')}`;
    }

    return stats;
  }

  // Lock attendance month
  async lockMonth(month: string, userId: number) {
    // Check if month already locked
    const existingLock = await prisma.attendanceMonth.findUnique({
      where: { month },
    });

    if (existingLock?.isLocked) {
      throw new ConflictError('Tháng này đã được chốt công');
    }

    // Lock the month
    const lockedMonth = await prisma.attendanceMonth.upsert({
      where: { month },
      update: {
        isLocked: true,
        lockedBy: userId,
        lockedAt: new Date(),
      },
      create: {
        month,
        isLocked: true,
        lockedBy: userId,
        lockedAt: new Date(),
      },
    });

    return lockedMonth;
  }

  // Check if month is locked
  async isMonthLocked(month: string): Promise<boolean> {
    const lock = await prisma.attendanceMonth.findUnique({
      where: { month },
    });
    return lock?.isLocked || false;
  }

  // Import attendance from file
  async importFromFile(filePath: string, userId: number) {
    const result = await importAttendanceFromFile(filePath);

    // Create attendance records for valid imports
    const createdRecords = [];
    for (const record of result.valid) {
      try {
        // Find user by employee code
        const user = await prisma.user.findUnique({
          where: { employeeCode: record.employeeCode },
        });

        if (!user) {
          result.invalid.push({
            ...record,
            errors: [...(record.errors || []), `Employee with code ${record.employeeCode} not found`],
          });
          continue;
        }

        // Parse times
        const checkInTime = record.checkInTime
          ? new Date(`${record.date} ${record.checkInTime}`)
          : null;
        const checkOutTime = record.checkOutTime
          ? new Date(`${record.date} ${record.checkOutTime}`)
          : null;

        // Create or update attendance
        const attendance = await prisma.attendance.upsert({
          where: {
            userId_date: {
              userId: user.id,
              date: new Date(record.date),
            },
          },
          update: {
            checkInTime,
            checkOutTime,
            status: (record.status || 'present') as any,
            leaveType: (record.leaveType || 'none') as any,
            notes: record.notes,
          },
          create: {
            userId: user.id,
            date: new Date(record.date),
            checkInTime,
            checkOutTime,
            status: (record.status || 'present') as any,
            leaveType: (record.leaveType || 'none') as any,
            notes: record.notes,
          },
        });

        createdRecords.push(attendance);
      } catch (error: any) {
        result.invalid.push({
          ...record,
          errors: [...(record.errors || []), error.message],
        });
      }
    }

    await logActivity(
      'import',
      userId,
      'attendance',
      `Imported ${createdRecords.length} attendance records`
    );

    return {
      ...result,
      importedCount: createdRecords.length,
    };
  }
}

export default new AttendanceService();
