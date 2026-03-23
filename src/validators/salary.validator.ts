import { z } from 'zod';

// Salary Status Enum
export const salaryStatusEnum = z.enum(['pending', 'approved', 'paid']);

// Query Schema
export const salaryQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().max(200, 'Từ khóa tìm kiếm không được vượt quá 200 ký tự.').optional(),
  roleId: z.string().regex(/^\d+$/).optional(),
  warehouseId: z.string().regex(/^\d+$/).optional(),
  userId: z.string().regex(/^\d+$/).optional(),
  month: z
    .string()
    .regex(/^\d{6}$/)
    .optional(), // YYYYMM format
  status: salaryStatusEnum.optional(),
  fromMonth: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  toMonth: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Get Salary by User and Month Schema
export const getSalaryByUserMonthSchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number),
  month: z.string().regex(/^\d{6}$/, 'Month must be in YYYYMM format'),
});

// Calculate Salary Schema
export const calculateSalarySchema = z.object({
  userId: z.number().min(1, 'User ID is required'),
  month: z.string().regex(/^\d{6}$/, 'Month must be in YYYYMM format'),
  basicSalary: z.number().min(0, 'Basic salary must be non-negative').optional(),
  allowance: z.number().min(0).optional(),
  bonus: z.number().min(0).optional(),
  advance: z.number().min(0).optional(),
  notes: z.string().max(255).optional(),
  preview: z.boolean().optional(),
});

// Calculate Batch Salary Schema
export const calculateBatchSalarySchema = z.object({
  month: z.string().regex(/^\d{6}$/, 'Month must be in YYYYMM format'),
  preview: z.boolean().optional(),
  users: z.array(
    z.object({
      userId: z.number().min(1, 'User ID is required'),
      basicSalary: z.number().min(0, 'Basic salary must be non-negative'),
      allowance: z.number().min(0).optional(),
      bonus: z.number().min(0).optional(),
      advance: z.number().min(0).optional()
    })
  ).min(1, 'At least one user is required')
});

// Update Salary Schema
export const updateSalarySchema = z.object({
  basicSalary: z.number().min(0).optional(),
  allowance: z.number().min(0).optional(),
  overtimePay: z.number().min(0).optional(),
  bonus: z.number().min(0).optional(),
  commission: z.number().min(0).optional(),
  deduction: z.number().min(0).optional(),
  advance: z.number().min(0).optional(),
  notes: z.string().max(255).optional(),
});

// Approve Salary Schema
export const approveSalarySchema = z.object({
  notes: z.string().max(500).optional(),
});

// Pay Salary Schema (Create Payment Voucher)
export const paySalarySchema = z.object({
  paymentDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid payment date',
  }),
  paymentMethod: z.enum(['cash', 'transfer']),
  notes: z.string().max(500).optional(),
});

// Recalculate Salary Schema
export const recalculateSalarySchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

export type SalaryQueryInput = z.infer<typeof salaryQuerySchema>;
export type CalculateSalaryInput = z.infer<typeof calculateSalarySchema>;
export type CalculateBatchSalaryInput = z.infer<typeof calculateBatchSalarySchema>;
export type UpdateSalaryInput = z.infer<typeof updateSalarySchema>;
export type PaySalaryInput = z.infer<typeof paySalarySchema>;
