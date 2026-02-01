import { z } from 'zod';

// Attendance Status Enum
export const attendanceStatusEnum = z.enum([
  'present',
  'absent',
  'late',
  'leave',
  'work_from_home',
]);

export const leaveTypeEnum = z.enum(['none', 'annual', 'sick', 'unpaid', 'other']);

// Query Schema
export const attendanceQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: attendanceStatusEnum.optional(),
  leaveType: leaveTypeEnum.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  month: z
    .string()
    .regex(/^\d{6}$/)
    .optional(), // YYYYMM format
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Check-in Schema
export const checkInSchema = z.object({
  checkInLocation: z.string().max(255).optional(),
  notes: z.string().max(255).optional(),
});

// Check-out Schema
export const checkOutSchema = z.object({
  checkOutLocation: z.string().max(255).optional(),
  notes: z.string().max(255).optional(),
});

// Update Attendance Schema (Admin only)
export const updateAttendanceSchema = z.object({
  status: attendanceStatusEnum.optional(),
  leaveType: leaveTypeEnum.optional(),
  checkInTime: z.string().optional(), // HH:mm:ss format
  checkOutTime: z.string().optional(), // HH:mm:ss format
  overtimeHours: z.number().min(0).max(24).optional(),
  checkInLocation: z.string().max(255).optional(),
  checkOutLocation: z.string().max(255).optional(),
  notes: z.string().max(255).optional(),
});

// Request Leave Schema
export const requestLeaveSchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date',
  }),
  leaveType: z.enum(['annual', 'sick', 'unpaid', 'other']),
  shift: z.enum(['morning', 'afternoon', 'all_day']).default('all_day'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

// Approve Leave Schema
export const approveLeaveSchema = z.object({
  approved: z.boolean(),
  notes: z.string().max(500).optional(),
});

// Monthly Report Schema
export const monthlyReportSchema = z.object({
  month: z.string().regex(/^\d{6}$/, 'Month must be in YYYYMM format'), // YYYYMM
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// Lock Month Schema
export const lockMonthSchema = z.object({
  month: z.string().regex(/^\d{6}$/, 'Month must be in YYYYMM format'),
});

export type AttendanceQueryInput = z.infer<typeof attendanceQuerySchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
export type RequestLeaveInput = z.infer<typeof requestLeaveSchema>;
export type LockMonthInput = z.infer<typeof lockMonthSchema>;
