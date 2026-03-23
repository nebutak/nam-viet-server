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
const STANDARD_WORK_HOURS_PER_MONTH = 208; // 26 days * 8 hours
const OVERTIME_RATE = 1.5; // 150% of hourly rate
const COMMISSION_RATE = 0.05; // 5% of sales revenue
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

  // Calculate tax based on progressive tax brackets (Vietnam 2024)
  private calculatePersonalIncomeTax(taxableIncome: number): number {
    if (taxableIncome <= 0) return 0;

    let tax = 0;
    const brackets = [
      { limit: 5000000, rate: 0.05 },
      { limit: 10000000, rate: 0.1 },
      { limit: 18000000, rate: 0.15 },
      { limit: 32000000, rate: 0.2 },
      { limit: 52000000, rate: 0.25 },
      { limit: 80000000, rate: 0.3 },
      { limit: Infinity, rate: 0.35 },
    ];

    let remaining = taxableIncome;
    let previousLimit = 0;

    for (const bracket of brackets) {
      const taxableAtThisBracket = Math.min(remaining, bracket.limit - previousLimit);
      if (taxableAtThisBracket <= 0) break;

      tax += taxableAtThisBracket * bracket.rate;
      remaining -= taxableAtThisBracket;
      previousLimit = bracket.limit;

      if (remaining <= 0) break;
    }

    return Math.round(tax);
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

    return {
      ...salary,
      totalSalary,
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

    // 1. Calculate overtime pay from attendance AND Overtime Sessions
    const attendanceReport = await attendanceService.getMonthlyReport(month, userId);
    const userAttendance = attendanceReport.users.find((u: any) => u.user.id === userId);
    const attendanceOvertime = userAttendance?.summary.totalOvertimeHours ?? 0;
    
    // NEW: Get hours from Overtime Sessions
    const sessionOvertime = await this.getOvertimeSessionHours(userId, month);
    console.log(`Overtime for user ${userId}: Attendance=${attendanceOvertime}, Session=${sessionOvertime}`);
    
    const totalOvertimeHours = Number(attendanceOvertime) + Number(sessionOvertime);

    const overtimePay =
      (actualBasicSalary / STANDARD_WORK_HOURS_PER_MONTH) * totalOvertimeHours * OVERTIME_RATE;

    // 2. Calculate commission from sales revenue
    const salesRevenue = await this.getUserSalesRevenue(userId, month);
    const commission = salesRevenue * COMMISSION_RATE;

    // 3. Calculate gross income
    const grossIncome = actualBasicSalary + allowance + overtimePay + bonus + commission;

    // 4. Calculate deductions (Insurance + Tax + Excess Leave)
    const insuranceDeduction = actualBasicSalary * TOTAL_INSURANCE_RATE;

    // Calculate Leave Deduction (1 Free Day Policy)
    const totalLeaveDays = userAttendance?.summary.leaveDays ?? 0;
    let leaveDeduction = 0;
    
    // Policy: 1 day per month is free. Excess is deducted.
    // Assuming standard 26 working days.
    if (totalLeaveDays > 1) {
      const excessDays = totalLeaveDays - 1;
      const dailySalary = actualBasicSalary / STANDARD_WORK_HOURS_PER_MONTH * 8; // or actualBasicSalary / 26
      leaveDeduction = dailySalary * excessDays;
      
      const leaveNote = `\n[System] Deducted ${excessDays} excess leave days (${leaveDeduction.toLocaleString()} VND)`;
      notes = notes ? notes + leaveNote : leaveNote;
    }

    // Tax = (Gross - Insurance - 11M personal deduction - 4.4M dependents) * progressive rate
    const PERSONAL_DEDUCTION = 11000000; // 11M VND
    const DEPENDENT_DEDUCTION = 4400000; // 4.4M VND per dependent (assume 0 for now)
    const taxableIncome =
      grossIncome - insuranceDeduction - leaveDeduction - PERSONAL_DEDUCTION - DEPENDENT_DEDUCTION;
    const tax = this.calculatePersonalIncomeTax(taxableIncome);

    const totalDeduction = insuranceDeduction + tax + leaveDeduction;

    // 5. Calculate net salary
    const netSalary = grossIncome - totalDeduction - advance;

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
        breakdown: {
          grossIncome,
          insuranceDeduction,
          tax,
          netSalary,
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
      breakdown: {
        grossIncome,
        insuranceDeduction,
        tax,
        netSalary,
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

    // 1. Recalculate overtime pay
    const attendanceReport = await attendanceService.getMonthlyReport(month, userId);
    const userAttendance = attendanceReport.users.find((u: any) => u.user.id === userId);
    const attendanceOvertime = userAttendance?.summary.totalOvertimeHours ?? 0;

    const sessionOvertime = await this.getOvertimeSessionHours(userId, month);
    const totalOvertimeHours = Number(attendanceOvertime) + Number(sessionOvertime);

    const overtimePay =
      (Number(basicSalary) / STANDARD_WORK_HOURS_PER_MONTH) * totalOvertimeHours * OVERTIME_RATE;

    // 2. Recalculate commission
    const salesRevenue = await this.getUserSalesRevenue(userId, month);
    const commission = salesRevenue * COMMISSION_RATE;

    // 3. Recalculate deductions
    const grossIncome =
      Number(basicSalary) + Number(allowance) + overtimePay + Number(bonus) + commission;
    const insuranceDeduction = Number(basicSalary) * TOTAL_INSURANCE_RATE;
    
    // Calculate Leave Deduction (1 Free Day Policy)
    const totalLeaveDays = userAttendance?.summary.leaveDays ?? 0;
    let leaveDeduction = 0;
    
    if (totalLeaveDays > 1) {
      const excessDays = totalLeaveDays - 1;
      const dailySalary = Number(basicSalary) / STANDARD_WORK_HOURS_PER_MONTH * 8;
      leaveDeduction = dailySalary * excessDays;
    }

    const PERSONAL_DEDUCTION = 11000000;
    const DEPENDENT_DEDUCTION = 4400000;
    const taxableIncome =
      grossIncome - insuranceDeduction - leaveDeduction - PERSONAL_DEDUCTION - DEPENDENT_DEDUCTION;
    const tax = this.calculatePersonalIncomeTax(taxableIncome);
    const totalDeduction = insuranceDeduction + tax + leaveDeduction;

    const netSalary = grossIncome - totalDeduction - Number(advance);

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
        grossIncome,
        insuranceDeduction,
        tax,
        netSalary,
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
