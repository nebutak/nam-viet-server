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
  private parseTimeFromValue(timeValue: Date | string): { h: number, m: number, s: number } {
    if (timeValue instanceof Date) {
      return { h: timeValue.getHours(), m: timeValue.getMinutes(), s: timeValue.getSeconds() };
    }
    if (typeof timeValue === 'string') {
      if (timeValue.includes('T')) {
        const d = new Date(timeValue);
        return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
      }
      const parts = timeValue.split(':');
      return {
        h: parseInt(parts[0] || '0', 10),
        m: parseInt(parts[1] || '0', 10),
        s: parseInt(parts[2] || '0', 10)
      };
    }
    return { h: 0, m: 0, s: 0 };
  }

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

    const mappedRecords = records.map((record) => {
      let workHours: number | null = null;
      if (record.checkInTime && record.checkOutTime) {
        const checkInDateTime = new Date(record.date);
        const inTime = this.parseTimeFromValue(record.checkInTime as any);
        checkInDateTime.setHours(inTime.h, inTime.m, inTime.s);

        const checkOutDateTime = new Date(record.date);
        const outTime = this.parseTimeFromValue(record.checkOutTime as any);
        checkOutDateTime.setHours(outTime.h, outTime.m, outTime.s);

        workHours = this.calculateWorkHours(checkInDateTime, checkOutDateTime);
      }

      return {
        ...record,
        workHours,
      };
    });

    return {
      data: mappedRecords,
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
    const localNow = new Date();
    const today = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate()));

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
    const localNow = new Date();
    const today = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate()));

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
    const inTime = this.parseTimeFromValue(existing.checkInTime as any);
    checkInDateTime.setHours(inTime.h, inTime.m, inTime.s);

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

    // Parse existing or new checkIn/checkOut times
    let checkInUpdateVal: Date | null | undefined = data.checkInTime === null ? null : undefined;
    let checkOutUpdateVal: Date | null | undefined = data.checkOutTime === null ? null : undefined;

    const getFinalDate = (
      inputTimeStr: string | null | undefined,
      existingTimeObj: Date | null,
      baseDate: Date
    ) => {
      if (inputTimeStr === null) return null;
      if (inputTimeStr) {
        const d = new Date(baseDate);
        const [h, m, s] = inputTimeStr.split(':').map(Number);
        d.setHours(h, m, s, 0);
        return d;
      }
      return existingTimeObj;
    };

    const finalCheckIn = getFinalDate(data.checkInTime, existing.checkInTime, existing.date);
    const finalCheckOut = getFinalDate(data.checkOutTime, existing.checkOutTime, existing.date);

    if (data.checkInTime !== undefined) checkInUpdateVal = finalCheckIn;
    if (data.checkOutTime !== undefined) checkOutUpdateVal = finalCheckOut;

    let overtimeHours = data.overtimeHours;
    let computedWorkHours: number | undefined;

    if (finalCheckIn && finalCheckOut) {
      // Need to use parseTimeFromValue if working with generated Date objects or string dates
      // But getFinalDate returns a native Date object, so it's safe to directly pass
      computedWorkHours = this.calculateWorkHours(finalCheckIn, finalCheckOut);
      if (data.overtimeHours === undefined) {
        overtimeHours = this.calculateOvertimeHours(computedWorkHours);
      }
    }

    const updateData: any = {
      ...(data.status && { status: data.status }),
      ...(data.leaveType && { leaveType: data.leaveType }),
      ...(data.checkInLocation && { checkInLocation: data.checkInLocation }),
      ...(data.checkOutLocation && { checkOutLocation: data.checkOutLocation }),
      ...(data.notes !== undefined && { notes: data.notes }),
    };

    if (checkInUpdateVal !== undefined) updateData.checkInTime = checkInUpdateVal;
    if (checkOutUpdateVal !== undefined) updateData.checkOutTime = checkOutUpdateVal;
    if (overtimeHours !== undefined) updateData.overtimeHours = overtimeHours;

    const attendance = await prisma.attendance.update({
      where: { id },
      data: updateData,
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
        const inTime = this.parseTimeFromValue(record.checkInTime as any);
        checkInDateTime.setHours(inTime.h, inTime.m, inTime.s);

        const checkOutDateTime = new Date(record.date);
        const outTime = this.parseTimeFromValue(record.checkOutTime as any);
        checkOutDateTime.setHours(outTime.h, outTime.m, outTime.s);

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
      averageWorkHours: 0,
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
        const inTime = this.parseTimeFromValue(record.checkInTime as any);
        totalCheckInMinutes += inTime.h * 60 + inTime.m;
        checkInCount++;
      }

      if (record.checkOutTime) {
        const outTime = this.parseTimeFromValue(record.checkOutTime as any);
        totalCheckOutMinutes += outTime.h * 60 + outTime.m;
        checkOutCount++;
      }

      // Calculate work hours if both check-in and check-out exist
      if (record.checkInTime && record.checkOutTime) {
        const checkInDateTime = new Date(record.date);
        const inTime = this.parseTimeFromValue(record.checkInTime as any);
        checkInDateTime.setHours(inTime.h, inTime.m, inTime.s);

        const checkOutDateTime = new Date(record.date);
        const outTime = this.parseTimeFromValue(record.checkOutTime as any);
        checkOutDateTime.setHours(outTime.h, outTime.m, outTime.s);

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

    // Calculate average work hours
    if (stats.presentDays > 0) {
      stats.averageWorkHours = stats.totalWorkHours / stats.presentDays;
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

  // Unlock attendance month
  async unlockMonth(month: string) {
    const existingLock = await prisma.attendanceMonth.findUnique({
      where: { month },
    });

    if (!existingLock?.isLocked) {
      throw new ConflictError('Tháng này chưa bị khóa công');
    }

    const unlockedMonth = await prisma.attendanceMonth.update({
      where: { month },
      data: {
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
      },
    });

    return unlockedMonth;
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
