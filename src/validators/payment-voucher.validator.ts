import { z } from 'zod';

export const createPaymentVoucherSchema = z.object({
  voucherType: z.enum(['salary', 'operating_cost', 'supplier_payment', 'refund', 'other']),
  supplierId: z.number().int().positive('ID nhà cung cấp phải là số dương').optional(),
  purchaseOrderId: z.number().int().positive().optional(),
  amount: z.number().positive('Số tiền phải là số dương'),
  paymentMethod: z.enum(['cash', 'transfer']),
  bankName: z.string().max(500).nullable().optional(),
  paymentDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Ngày thanh toán không hợp lệ'),
  reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(255).nullable().optional(),
});

export const updatePaymentVoucherSchema = z.object({
  voucherType: z
    .enum(['salary', 'operating_cost', 'supplier_payment', 'refund', 'other'])
    .optional(),
  supplierId: z.number().int().positive('ID nhà cung cấp phải là số dương').optional(),
  purchaseOrderId: z.number().int().positive().optional(),
  amount: z.number().positive('Số tiền phải là số dương').optional(),
  paymentMethod: z.enum(['cash', 'transfer']).optional(),
  bankName: z.string().max(500).nullable().optional(),
  paymentDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Ngày thanh toán không hợp lệ')
    .optional(),
  reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(255).nullable().optional(),
});

export const approveVoucherSchema = z.object({
  notes: z.string().max(255).optional(),
});

export const VoucherIdSchema = z.object({
  id: z.string().transform(Number),
});

export const postVoucherSchema = z.object({
  notes: z.string().max(255).optional(),
});

export const paymentVoucherQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().optional(),
  supplierId: z.string().regex(/^\d+$/).transform(Number).optional(),
  voucherType: z
    .enum(['salary', 'operating_cost', 'supplier_payment', 'refund', 'other'])
    .optional(),
  paymentMethod: z.enum(['cash', 'transfer']).optional(),
  status: z.enum(['draft', 'posted', 'cancelled']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type CreatePaymentVoucherInput = z.infer<typeof createPaymentVoucherSchema>;
export type UpdatePaymentVoucherInput = z.infer<typeof updatePaymentVoucherSchema>;
export type ApproveVoucherInput = z.infer<typeof approveVoucherSchema>;
export type PostVoucherInput = z.infer<typeof postVoucherSchema>;
export type PaymentVoucherQueryInput = z.infer<typeof paymentVoucherQuerySchema>;
