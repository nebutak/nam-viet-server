import { z } from 'zod';

export const createWarrantySchema = z.object({
  customerId: z.number().int().positive(),
  productId: z.number().int().positive(),
  invoiceId: z.number().int().positive(),
  invoiceDetailId: z.number().int().positive().optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  quantity: z.number().positive(),
  periodMonths: z.number().int().nonnegative(),
  warrantyCost: z.number().nonnegative().optional(),
  note: z.string().optional().nullable(),
});

export const updateWarrantySchema = z.object({
  status: z.enum(['pending', 'active', 'expired', 'inactive']).optional(),
  serialNumber: z.string().max(100).optional().nullable(),
  quantity: z.number().positive().optional(),
  periodMonths: z.number().int().nonnegative().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  nextReminderDate: z.string().datetime().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const updateWarrantyStatusSchema = z.object({
  status: z.enum(['pending', 'active', 'expired', 'inactive']),
});

export const warrantyQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().optional(),
  customerId: z.string().regex(/^\d+$/).transform(Number).optional(),
  productId: z.string().regex(/^\d+$/).transform(Number).optional(),
  invoiceId: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const sendReminderEmailSchema = z.object({
  subject: z.string().optional(),
  content: z.string().optional(),
});

export type CreateWarrantyInput = z.infer<typeof createWarrantySchema>;
export type UpdateWarrantyInput = z.infer<typeof updateWarrantySchema>;
export type UpdateWarrantyStatusInput = z.infer<typeof updateWarrantyStatusSchema>;
export type WarrantyQueryInput = z.infer<typeof warrantyQuerySchema>;
export type SendReminderEmailInput = z.infer<typeof sendReminderEmailSchema>;
