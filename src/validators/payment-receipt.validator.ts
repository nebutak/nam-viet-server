import { z } from 'zod';

export const createPaymentReceiptSchema = z.object({
  receiptType: z.enum(['sales', 'debt_collection', 'refund', 'other']),
  customerId: z.number().int().positive('ID khách hàng phải là số dương'),
  orderId: z.number().int().positive('ID đơn hàng phải là số dương').optional(),
  amount: z.number().positive('Số tiền phải là số dương'),
  paymentMethod: z.enum(['cash', 'transfer', 'card']),
  bankName: z.string().max(500).nullable().optional(),
  transactionReference: z.string().max(100).nullable().optional(),
  receiptDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Ngày thu tiền không hợp lệ'),
  notes: z.string().max(255).nullable().optional(),
});

export const updatePaymentReceiptSchema = z.object({
  receiptType: z.enum(['sales', 'debt_collection', 'refund', 'other']).optional(),
  amount: z.number().positive('Số tiền phải là số dương').optional(),
  paymentMethod: z.enum(['cash', 'transfer', 'card']).optional(),
  bankName: z.string().max(500).nullable().optional(),
  transactionReference: z.string().max(100).nullable().optional(),
  receiptDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Ngày thu tiền không hợp lệ')
    .optional(),
  notes: z.string().max(255).nullable().optional(),
});

export const approveReceiptSchema = z.object({
  notes: z.string().max(255).optional(),
});

export const postReceiptSchema = z.object({
  notes: z.string().max(255).optional(),
});

export const paymentReceiptQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().optional(),
  customerId: z.string().regex(/^\d+$/).transform(Number).optional(),
  orderId: z.string().regex(/^\d+$/).transform(Number).optional(),
  receiptType: z.enum(['sales', 'debt_collection', 'refund', 'other']).optional(),
  paymentMethod: z.enum(['cash', 'transfer', 'card']).optional(),
  approvalStatus: z.enum(['approved', 'pending']).optional(),
  postedStatus: z.enum(['posted', 'draft']).optional(),
  isPosted: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type CreatePaymentReceiptInput = z.infer<typeof createPaymentReceiptSchema>;
export type UpdatePaymentReceiptInput = z.infer<typeof updatePaymentReceiptSchema>;
export type ApproveReceiptInput = z.infer<typeof approveReceiptSchema>;
export type PostReceiptInput = z.infer<typeof postReceiptSchema>;
export type PaymentReceiptQueryInput = z.infer<typeof paymentReceiptQuerySchema>;
