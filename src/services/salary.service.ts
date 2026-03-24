import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import attendanceService from '@services/attendance.service';
import {
  CalculateSalaryInput,
  CalculateBatchSalaryInput,
  UpdateSalaryInput,
  PaySalaryInput,
  SalaryQueryInput,
} from '@validators/salary.validator';
const prisma = new PrismaClient();

// Salary calculation constants
// NOTE: Standard work days/hours are computed dynamically per month.
const OVERTIME_RATE = 1.5; // 150% of hourly rate
const COMMISSION_RATE = 0.05; // 5% of sales revenue
const LATE_PENALTY_PER_INSTANCE = 50000; // Fixed penalty per late occurrence
const PIT_RATE = 0.2; // 20% flat PIT rate (see calculatePersonalIncomeTax)
const SOCIAL_INSURANCE_RATE = 0.08; // BHXH 8%
const HEALTH_INSURANCE_RATE = 0.015; // BHYT 1.5%
const UNEMPLOYMENT_INSURANCE_RATE = 0.01; // BHTN 1%
const TOTAL_INSURANCE_RATE =
  SOCIAL_INSURANCE_RATE + HEALTH_INSURANCE_RATE + UNEMPLOYMENT_INSURANCE_RATE; // 10.5%



class SalaryService {
  // Get all salary records with filters
  async getAll(query: SalaryQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      userId,
      roleId,
      warehouseId,
      month,
      status,
      fromMonth,
      toMonth,
      sortBy = 'month',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Prisma.SalaryWhereInput = {
      ...(userId && { userId: parseInt(userId) }),
      ...(month && { month }),
      ...(status && { status }),
      ...(fromMonth &&
        toMonth && {
          month: {
            gte: fromMonth,
            lte: toMonth,
          },
        }),
      ...(roleId && { user: { roleId: parseInt(roleId) } }),
      ...(warehouseId && { user: { warehouseId: parseInt(warehouseId) } }),
      ...(search && {
        user: {
          OR: [
            { fullName: { contains: search } },
            { email: { contains: search } },
            { employeeCode: { contains: search } },
            { phone: { contains: search } },
          ],
        },
      }),
    };

    const [records, total] = await Promise.all([
      prisma.salary.findMany({
        where,
        select: {
          id: true,
          userId: true,
          month: true,
          basicSalary: true,
          allowance: true,
          overtimePay: true,
          bonus: true,
          commission: true,
          deduction: true,
          advance: true,
          notes: true,
          status: true,
          isPosted: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              email: true,
            },
          },
          creator: {
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
          payer: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
          voucher: {
            select: {
              id: true,
              voucherCode: true,
              amount: true,
            },
          },
        },
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.salary.count({ where }),
    ]);

    // Calculate total salary for each record
    const recordsWithTotal = records.map((record) => ({
      ...record,
      totalSalary:
        Number(record.basicSalary) +
        Number(record.allowance) +
        Number(record.overtimePay) +
        Number(record.bonus) +
        Number(record.commission) -
        Number(record.deduction) -
        Number(record.advance),
    }));

    const result = {
      data: recordsWithTotal,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    return result;
  }

  // Calculate PIT using flat 20% rate (see prompt requirement).
  // If taxable income <= 0, PIT = 0.
  private calculatePersonalIncomeTax(taxableIncome: number): number {
    if (taxableIncome <= 0) return 0;
    return Math.round(taxableIncome * PIT_RATE);
  }

  private getMonthContext(month: string) {
    const year = parseInt(month.substring(0, 4), 10);
    const monthNum = parseInt(month.substring(4, 6), 10); // 1-12
    const monthIndex = monthNum - 1; // 0-11

    const startDate = new Date(Date.UTC(year, monthIndex, 1));
    const nextMonthStart = new Date(Date.UTC(year, monthIndex + 1, 1));
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

    return {
      year,
      monthNum,
      monthIndex,
      startDate,
      nextMonthStart,
      daysInMonth,
    };
  }

  private getSundayCount(daysInMonth: number, year: number, monthIndex: number): number {
    let sundayCount = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(year, monthIndex, day));
      if (d.getUTCDay() === 0) sundayCount++;
    }
    return sundayCount;
  }

  private getShiftFraction(shift: any): number {
    if (shift === 'morning' || shift === 'afternoon') return 0.5;
    return 1;
  }

  private toYmdUtcKey(dateValue: any): string {
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    return d.toISOString().slice(0, 10);
  }

  private toMinutesSince8am(dateTimeValue: any, compareHour = 8): number | null {
    if (!dateTimeValue) return null;

    // Prisma @db.Time usually comes as string: "HH:MM:SS"
    if (typeof dateTimeValue === 'string') {
      const parts = dateTimeValue.split(':');
      const h = parseInt(parts[0] || '0', 10);
      const m = parseInt(parts[1] || '0', 10);
      const minutes = h * 60 + m;
      return minutes - compareHour * 60;
    }

    if (dateTimeValue instanceof Date) {
      return dateTimeValue.getHours() * 60 + dateTimeValue.getMinutes() - compareHour * 60;
    }

    return null;
  }

  private async getAttendanceStatsForSalary(userId: number, month: string) {
    const { year, monthIndex, startDate, nextMonthStart, daysInMonth } = this.getMonthContext(month);
    const sundayCount = this.getSundayCount(daysInMonth, year, monthIndex);
    const standardWorkDays = daysInMonth - sundayCount;

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lt: nextMonthStart,
        },
      },
      select: {
        date: true,
        status: true,
        leaveType: true,
        shift: true,
        checkInTime: true,
        overtimeHours: true,
      },
    });

    const recordMap = new Map<string, (typeof attendanceRecords)[number]>();
    for (const r of attendanceRecords) {
      recordMap.set(this.toYmdUtcKey(r.date), r);
    }

    let workDaysActual = 0; // X
    let permittedLeaveDays = 0; // P
    let unpermittedDays = 0; // KP
    let lateCount = 0; // M

    let overtimeHoursAttendance = 0;
    for (const r of attendanceRecords) {
      overtimeHoursAttendance += Number(r.overtimeHours || 0);
    }

    const permittedLeaveTypes = new Set(['annual', 'sick', 'other']);
    const unpermittedLeaveTypes = new Set(['unpaid', 'none']);

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(year, monthIndex, day));
      const key = d.toISOString().slice(0, 10);
      const isSunday = d.getUTCDay() === 0;
      if (isSunday) continue; // Sundays do not count towards X/P/KP, but are paid separately

      const record = recordMap.get(key);
      if (!record) {
        // No attendance record => treat as unpermitted absence.
        unpermittedDays += 1;
        continue;
      }

      const shiftFraction = this.getShiftFraction(record.shift);
      switch (record.status) {
        case 'present':
        case 'late':
        case 'work_from_home':
          workDaysActual += 1;
          // Late check (prompt: compare with 08:00)
          if (record.status === 'late') {
            lateCount += 1;
          } else {
            const lateMinutes = this.toMinutesSince8am(record.checkInTime, 8);
            if (lateMinutes !== null && lateMinutes > 0) lateCount += 1;
          }
          break;

        case 'leave': {
          const isPermitted = permittedLeaveTypes.has(record.leaveType as any);
          const isUnpermitted = unpermittedLeaveTypes.has(record.leaveType as any);

          if (isPermitted) {
            permittedLeaveDays += shiftFraction;
          } else if (isUnpermitted) {
            unpermittedDays += shiftFraction;
          } else {
            // Fallback: treat unknown leave types as unpermitted.
            unpermittedDays += shiftFraction;
          }
          break;
        }

        case 'absent':
          unpermittedDays += 1;
          break;
      }
    }

    return {
      standardWorkDays,
      sundayCount,
      workDaysActual,
      permittedLeaveDays,
      unpermittedDays,
      lateCount,
      overtimeHoursAttendance,
    };
  }

  private async buildSalaryBreakdown(params: {
    userId: number;
    month: string;
    basicSalaryInput: number;
    allowance: number;
    overtimePay: number;
    bonus: number;
    commission: number;
    advance: number;
  }) {
    const {
      userId,
      month,
      basicSalaryInput,
      allowance,
      overtimePay,
      bonus,
      commission,
      advance,
    } = params;

    const PERSONAL_DEDUCTION = 11000000; // 11M
    const DEPENDENT_DEDUCTION = 0; // Not provided in current DB logic

    const attendanceStats = await this.getAttendanceStatsForSalary(userId, month);
    const { standardWorkDays, sundayCount, workDaysActual, permittedLeaveDays, lateCount } = attendanceStats;

    const dailySalary = standardWorkDays > 0 ? basicSalaryInput / standardWorkDays : 0;

    // Time salary base includes full paid leave days (even those beyond 2 days).
    const timeSalaryBase = dailySalary * (workDaysActual + permittedLeaveDays + sundayCount);

    const excessLeaveDays = Math.max(permittedLeaveDays - 2, 0);
    const excessLeavePenalty = dailySalary * 0.5 * excessLeaveDays;

    const timeSalaryEarned = timeSalaryBase - excessLeavePenalty;

    const latePenalty = lateCount * LATE_PENALTY_PER_INSTANCE;

    // Insurance: keep 10.5% on "basic salary" input.
    const insuranceDeduction = basicSalaryInput * TOTAL_INSURANCE_RATE;

    // PIT: only subtract insurance and 11M personal deduction (per prompt).
    const taxableIncome =
      timeSalaryEarned + allowance + overtimePay + bonus + commission - insuranceDeduction - PERSONAL_DEDUCTION - DEPENDENT_DEDUCTION;
    const pitTax = taxableIncome <= 0 ? 0 : this.calculatePersonalIncomeTax(taxableIncome);

    const netSalary =
      timeSalaryEarned +
      allowance +
      overtimePay +
      bonus +
      commission -
      insuranceDeduction -
      latePenalty -
      pitTax -
      advance;

    // NOTE: DB deduction field must make SalaryService's persisted total match `netSalary`.
    // getById uses: basicSalary + incomes - deduction - advance
    // => deduction = basicSalary - timeEarned + insurance + late + pit + (excess already handled via timeEarned)
    const deductionForDb = (basicSalaryInput - timeSalaryEarned) + insuranceDeduction + latePenalty + pitTax;

    return {
      // For UI transparency
      standardWorkDays,
      sundayCount,
      workDaysActual,
      permittedLeaveDays,
      unpermittedDays: attendanceStats.unpermittedDays,
      lateCount,
      latePenaltyPerInstance: LATE_PENALTY_PER_INSTANCE,
      latePenaltyAmount: latePenalty,
      dailySalary,
      timeSalaryBase,
      timeSalaryEarned,
      excessLeaveDays,
      excessLeavePenalty,
      insuranceDeduction,
      insuranceRate: TOTAL_INSURANCE_RATE,
      pitTax,
      pitRate: PIT_RATE,

      // Totals
      netSalary,
      deductionForDb,
    };
  }

  // Get user's sales revenue for the month
  private async getUserSalesRevenue(userId: number, month: string): Promise<number> {
    const year = parseInt(month.substring(0, 4));
    const monthNum = parseInt(month.substring(4, 6));

    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    // Get sales orders created by this user
    const orders = await prisma.invoice.findMany({
      where: {
        createdBy: userId,
        orderDate: {
          gte: startDate,
          lte: endDate,
        },
        orderStatus: {
          in: ['completed'],
        },
      },
      select: {
        totalAmount: true,
      },
    });

    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    return totalRevenue;
  }

  // Get overtime hours from Overtime Sessions
  private async getOvertimeSessionHours(userId: number, month: string): Promise<number> {
    const year = parseInt(month.substring(0, 4));
    const monthNum = parseInt(month.substring(4, 6));
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);

    const result = await prisma.overtimeEntry.aggregate({
      _sum: {
        actualHours: true,
      },
      where: {
        userId,
        // Filter by session start time or entry start time? 
        // Using session time for consistency with "Session Management"
        session: {
          startTime: {
            gte: startDate,
            lte: endDate,
          },
          status: 'closed', // Only count closed sessions to be safe? Or all? Plan said "Close session to calc hours", so definitely closed.
        }
      }
    });

    return Number(result._sum.actualHours || 0);
  }

  // Get salary by ID
  async getById(id: number) {
    const salary = await prisma.salary.findUnique({
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
        creator: true,
        approver: true,
        payer: true,
        voucher: true,
      },
    });

    if (!salary) {
      throw new NotFoundError('Salary record');
    }

    const totalSalary =
      Number(salary.basicSalary) +
      Number(salary.allowance) +
      Number(salary.overtimePay) +
      Number(salary.bonus) +
      Number(salary.commission) -
      Number(salary.deduction) -
      Number(salary.advance);

    const breakdown = await this.buildSalaryBreakdown({
      userId: salary.userId,
      month: salary.month,
      basicSalaryInput: Number(salary.basicSalary),
      allowance: Number(salary.allowance),
      overtimePay: Number(salary.overtimePay),
      bonus: Number(salary.bonus),
      commission: Number(salary.commission),
      advance: Number(salary.advance),
    });

    return {
      ...salary,
      totalSalary: breakdown.netSalary ?? totalSalary,
      breakdown,
    };
  }

  // Get salary by user and month
  async getByUserAndMonth(userId: number, month: string) {
    const salary = await prisma.salary.findUnique({
      where: {
        userId_month: {
          userId,
          month,
        },
      },
      include: {
        user: true,
        creator: true,
        approver: true,
        payer: true,
        voucher: true,
      },
    });

    if (!salary) {
      throw new NotFoundError(`Salary record for user ${userId} in month ${month}`);
    }

    const totalSalary =
      Number(salary.basicSalary) +
      Number(salary.allowance) +
      Number(salary.overtimePay) +
      Number(salary.bonus) +
      Number(salary.commission) -
      Number(salary.deduction) -
      Number(salary.advance);

    return {
      ...salary,
      totalSalary,
    };
  }

  // Calculate batch salaries
  async calculateBatch(data: CalculateBatchSalaryInput, creatorId: number) {
    const { month, users } = data;
    const results = [];
    const errors = [];

    for (const user of users) {
      try {
        // calculate will handle duplicate existing salaries and properly overwrite if pending or reject if approved

        const calcData: CalculateSalaryInput = {
          userId: user.userId,
          month,
          basicSalary: user.basicSalary,
          allowance: user.allowance || 0,
          bonus: user.bonus || 0,
          advance: user.advance || 0,
          preview: data.preview,
          notes: 'Tự động tính lương hàng loạt',
        };

        const result = await this.calculate(calcData, creatorId);
        results.push(result);
      } catch (error: any) {
        errors.push({
          userId: user.userId,
          message: error.message || 'Lỗi khi tính toán lương',
        });
      }
    }

    return {
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors,
    };
  }

  // Calculate salary for a user in a month
  async calculate(data: CalculateSalaryInput, creatorId: number) {
    const { userId, month, basicSalary, allowance = 0, bonus = 0, advance = 0, preview = false } = data;
    let { notes } = data;

    // Check if salary already exists
    const existing = await prisma.salary.findUnique({
      where: {
        userId_month: {
          userId,
          month,
        },
      },
      include: {
        user: true,
        creator: true,
      }
    });

    // Based on user request, we ALWAYS permit overwriting salary even if it is not pending anymore.
    // The frontend may show a warning, but we do not throw ConflictError here.

    // Get user info (no basicSalary field in User model, will use from params or default)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true },
    });

    if (!user) {
      throw new NotFoundError('Không tìm thấy nhân viên');
    }

    const actualBasicSalary = basicSalary ?? 10000000; // Default 10M if not provided
    const { year, monthIndex, daysInMonth } = this.getMonthContext(month);
    const sundayCount = this.getSundayCount(daysInMonth, year, monthIndex);
    const standardWorkDays = daysInMonth - sundayCount;
    const standardWorkHours = standardWorkDays * 8;

    // 1) Overtime hours (attendance + overtime sessions)
    const attendanceReport = await attendanceService.getMonthlyReport(month, userId);
    const userAttendance = attendanceReport.users.find((u: any) => u.user.id === userId);
    const attendanceOvertimeHours = userAttendance?.summary.totalOvertimeHours ?? 0;

    const sessionOvertimeHours = await this.getOvertimeSessionHours(userId, month);
    const totalOvertimeHours = Number(attendanceOvertimeHours) + Number(sessionOvertimeHours);

    const overtimePay =
      standardWorkHours > 0
        ? (actualBasicSalary / standardWorkHours) * totalOvertimeHours * OVERTIME_RATE
        : 0;

    // 2) Commission from sales revenue
    const salesRevenue = await this.getUserSalesRevenue(userId, month);
    const commission = salesRevenue * COMMISSION_RATE;

    // 3) Attendance-based salary breakdown (X/M/P/KP + leave penalty, late penalty, insurance, PIT)
    const breakdown = await this.buildSalaryBreakdown({
      userId,
      month,
      basicSalaryInput: actualBasicSalary,
      allowance,
      overtimePay,
      bonus,
      commission,
      advance,
    });

    const netSalary = breakdown.netSalary;
    const totalDeduction = breakdown.deductionForDb;

    // Keep legacy keys for the preview UI.
    const grossIncome =
      breakdown.timeSalaryEarned + allowance + overtimePay + bonus + commission;
    const insuranceDeduction = breakdown.insuranceDeduction;
    const tax = breakdown.pitTax;

    if (preview) {
      // IF PREVIEW, return the dummy object as if it were created
      return {
        id: existing ? existing.id : -1,
        userId,
        month,
        basicSalary: actualBasicSalary,
        allowance,
        overtimePay,
        bonus,
        commission,
        deduction: totalDeduction,
        advance,
        notes,
        paymentDate: null,
        status: 'pending',
        isPosted: false,
        createdBy: creatorId,
        createdAt: new Date(),
        user,
        creator: null,
        totalSalary: netSalary,
        workDays: breakdown.standardWorkDays,
        overtimeHours: totalOvertimeHours,
        breakdown: {
          ...breakdown,
          grossIncome,
          insuranceDeduction,
          tax,
        },
      };
    }

    let salary;
    if (existing) {
      salary = await prisma.salary.update({
        where: { id: existing.id },
        data: {
          basicSalary: actualBasicSalary,
          allowance,
          overtimePay,
          bonus,
          commission,
          deduction: totalDeduction,
          advance,
          notes,
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              email: true,
            },
          },
          creator: true,
        },
      });
      // Log activity
      logActivity('update', creatorId, 'salary', {
        id: salary.id,
        userId,
        month,
        netSalary,
      });
    } else {
      salary = await prisma.salary.create({
        data: {
          userId,
          month,
          basicSalary: actualBasicSalary,
          allowance,
          overtimePay,
          bonus,
          commission,
          deduction: totalDeduction,
          advance,
          notes,
          createdBy: creatorId,
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              email: true,
            },
          },
          creator: true,
        },
      });
      // Log activity
      logActivity('calculate_salary', creatorId, 'salary', {
        id: salary.id,
        userId,
        month,
        netSalary,
      });
    }

    return {
      ...salary,
      totalSalary: netSalary,
      workDays: breakdown.standardWorkDays,
      overtimeHours: totalOvertimeHours,
      breakdown: {
        ...breakdown,
        grossIncome,
        insuranceDeduction,
        tax,
      },
    };
  }

  // Recalculate existing salary
  async recalculate(id: number, adminId: number) {
    const existing = await prisma.salary.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existing) {
      throw new NotFoundError('Salary record');
    }

    if (existing.status === 'paid') {
      throw new ValidationError('Cannot recalculate paid salary');
    }

    const { userId, month, basicSalary, allowance, bonus, advance } = existing;
    const { year, monthIndex, daysInMonth } = this.getMonthContext(month);
    const sundayCount = this.getSundayCount(daysInMonth, year, monthIndex);
    const standardWorkDays = daysInMonth - sundayCount;
    const standardWorkHours = standardWorkDays * 8;

    // 1) Recalculate overtime pay
    const attendanceReport = await attendanceService.getMonthlyReport(month, userId);
    const userAttendance = attendanceReport.users.find((u: any) => u.user.id === userId);
    const attendanceOvertimeHours = userAttendance?.summary.totalOvertimeHours ?? 0;

    const sessionOvertimeHours = await this.getOvertimeSessionHours(userId, month);
    const totalOvertimeHours = Number(attendanceOvertimeHours) + Number(sessionOvertimeHours);

    const overtimePay =
      standardWorkHours > 0
        ? (Number(basicSalary) / standardWorkHours) * totalOvertimeHours * OVERTIME_RATE
        : 0;

    // 2) Recalculate commission
    const salesRevenue = await this.getUserSalesRevenue(userId, month);
    const commission = salesRevenue * COMMISSION_RATE;

    // 3) Recalculate attendance-based salary & deductions
    const breakdown = await this.buildSalaryBreakdown({
      userId,
      month,
      basicSalaryInput: Number(basicSalary),
      allowance: Number(allowance),
      overtimePay: Number(overtimePay),
      bonus: Number(bonus),
      commission: Number(commission),
      advance: Number(advance),
    });

    const netSalary = breakdown.netSalary;
    const totalDeduction = breakdown.deductionForDb;

    // Legacy keys for the response UI.
    const grossIncome =
      breakdown.timeSalaryEarned + Number(allowance) + Number(overtimePay) + Number(bonus) + commission;
    const insuranceDeduction = breakdown.insuranceDeduction;
    const tax = breakdown.pitTax;

    // Update salary
    const updated = await prisma.salary.update({
      where: { id },
      data: {
        overtimePay,
        commission,
        deduction: totalDeduction,
      },
      include: {
        user: true,
        creator: true,
      },
    });

    // Log activity
    logActivity('recalculate_salary', adminId, 'salary', {
      id,
      netSalary,
    });

    return {
      ...updated,
      totalSalary: netSalary,
      breakdown: {
        ...breakdown,
        grossIncome,
        insuranceDeduction,
        tax,
      },
    };
  }

  // Update salary (admin only, before approval)
  async update(id: number, data: UpdateSalaryInput, adminId: number) {
    const existing = await prisma.salary.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Salary record');
    }

    if (existing.status !== 'pending') {
      throw new ValidationError('Can only update pending salary records');
    }

    const updated = await prisma.salary.update({
      where: { id },
      data: {
        ...(data.basicSalary !== undefined && { basicSalary: data.basicSalary }),
        ...(data.allowance !== undefined && { allowance: data.allowance }),
        ...(data.overtimePay !== undefined && { overtimePay: data.overtimePay }),
        ...(data.bonus !== undefined && { bonus: data.bonus }),
        ...(data.commission !== undefined && { commission: data.commission }),
        ...(data.deduction !== undefined && { deduction: data.deduction }),
        ...(data.advance !== undefined && { advance: data.advance }),
        ...(data.notes && { notes: data.notes }),
      },
      include: {
        user: true,
      },
    });

    // Log activity
    logActivity('update', adminId, 'salary', {
      id,
      changes: Object.keys(data),
    });

    const totalSalary =
      Number(updated.basicSalary) +
      Number(updated.allowance) +
      Number(updated.overtimePay) +
      Number(updated.bonus) +
      Number(updated.commission) -
      Number(updated.deduction) -
      Number(updated.advance);

    return {
      ...updated,
      totalSalary,
    };
  }

  // Approve salary
  async approve(id: number, approverId: number, notes?: string) {
    const salary = await prisma.salary.findUnique({
      where: { id },
    });

    if (!salary) {
      throw new NotFoundError('Salary record');
    }

    if (salary.status !== 'pending') {
      throw new ValidationError('Only pending salaries can be approved');
    }

    const updated = await prisma.salary.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date(),
        ...(notes && { notes }),
      },
      include: {
        user: true,
        approver: true,
      },
    });

    // Log activity
    logActivity('approve', approverId, 'salary', {
      id,
      userId: salary.userId,
      month: salary.month,
    });

    return updated;
  }

  // Pay salary (create payment voucher)
  async pay(id: number, data: PaySalaryInput, payerId: number) {
    const salary = await prisma.salary.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!salary) {
      throw new NotFoundError('Salary record');
    }

    if (salary.status !== 'approved') {
      throw new ValidationError('Only approved salaries can be paid');
    }

    if (salary.isPosted) {
      throw new ConflictError('Salary already paid');
    }

    const totalSalary =
      Number(salary.basicSalary) +
      Number(salary.allowance) +
      Number(salary.overtimePay) +
      Number(salary.bonus) +
      Number(salary.commission) -
      Number(salary.deduction) -
      Number(salary.advance);

    // Create payment voucher using transaction
    const result = await prisma.$transaction(async (tx) => {
      // Generate voucher code
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const count = await tx.paymentVoucher.count({
        where: {
          createdAt: {
            gte: new Date(date.setHours(0, 0, 0, 0)),
            lt: new Date(date.setHours(23, 59, 59, 999)),
          },
        },
      });
      const voucherCode = `PC-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;

      // Create payment voucher
      const voucher = await tx.paymentVoucher.create({
        data: {
          voucherCode,
          paymentDate: new Date(data.paymentDate),
          voucherType: 'salary',
          amount: totalSalary,
          paymentMethod: data.paymentMethod,
          notes: `Trả lương tháng ${salary.month} cho ${salary.user.fullName}. ${data.notes || ''}`,
          status: 'posted',
          postedAt: new Date(),
          createdBy: payerId,
        },
      });

      // Update salary record
      const updatedSalary = await tx.salary.update({
        where: { id },
        data: {
          status: 'paid',
          isPosted: true,
          paymentDate: new Date(data.paymentDate),
          paidBy: payerId,
          voucherId: voucher.id,
        },
        include: {
          user: true,
          payer: true,
          voucher: true,
        },
      });

      return { salary: updatedSalary, voucher };
    });

    // Log activity
    logActivity('pay_salary', payerId, 'salary', {
      id,
      voucherId: result.voucher.id,
      amount: totalSalary,
    });

    return result;
  }

  // Delete salary (only pending)
  async delete(id: number, adminId: number) {
    const existing = await prisma.salary.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Salary record');
    }

    if (existing.status !== 'pending') {
      throw new ValidationError('Can only delete pending salary records');
    }

    await prisma.salary.delete({
      where: { id },
    });

    // Log activity
    logActivity('delete', adminId, 'salary', {
      id,
      userId: existing.userId,
      month: existing.month,
    });

    return { message: 'Salary record deleted' };
  }

  // Get salary summary for a period
  async getSummary(fromMonth: string, toMonth: string) {
    const salaries = await prisma.salary.findMany({
      where: {
        month: {
          gte: fromMonth,
          lte: toMonth,
        },
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

    const summary = {
      totalRecords: salaries.length,
      totalBasicSalary: 0,
      totalAllowance: 0,
      totalOvertimePay: 0,
      totalBonus: 0,
      totalCommission: 0,
      totalDeduction: 0,
      totalAdvance: 0,
      totalNetSalary: 0,
      byStatus: {
        pending: 0,
        approved: 0,
        paid: 0,
      },
    };

    salaries.forEach((salary) => {
      summary.totalBasicSalary += Number(salary.basicSalary);
      summary.totalAllowance += Number(salary.allowance);
      summary.totalOvertimePay += Number(salary.overtimePay);
      summary.totalBonus += Number(salary.bonus);
      summary.totalCommission += Number(salary.commission);
      summary.totalDeduction += Number(salary.deduction);
      summary.totalAdvance += Number(salary.advance);

      const netSalary =
        Number(salary.basicSalary) +
        Number(salary.allowance) +
        Number(salary.overtimePay) +
        Number(salary.bonus) +
        Number(salary.commission) -
        Number(salary.deduction) -
        Number(salary.advance);

      summary.totalNetSalary += netSalary;
      summary.byStatus[salary.status]++;
    });

    return summary;
  }
}

export default new SalaryService();
