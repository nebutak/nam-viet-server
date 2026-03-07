import { z } from 'zod';

export const createExpirySchema = z.object({
  customerId: z.number({ message: 'ID khách hàng là bắt buộc' }),
  accountId: z.number().optional().nullable(),
  accountName: z.string().optional().nullable(),
  startDate: z.string().datetime({ message: 'Ngày bắt đầu không hợp lệ' }),
  months: z.number().min(1, { message: 'Số tháng ít nhất là 1' }).optional(),
  invoiceId: z.string().optional().nullable(),
  productId: z.number().optional().nullable(),
  alertDateStep: z.number().optional().default(30),
  note: z.string().optional().nullable(),
  options: z.array(z.any()).optional().default([]),
  userId: z.number().optional().nullable(),
});

export const updateExpirySchema = z.object({
  accountId: z.number({ message: 'ID tài khoản là bắt buộc' }),
  accountName: z.string({ message: 'Tên tài khoản là bắt buộc' }),
  startDate: z.string().datetime({ message: 'Ngày bắt đầu không hợp lệ' }),
  months: z.number().min(1, { message: 'Số tháng ít nhất là 1' }).optional(),
  invoiceId: z.string().optional().nullable(),
  productId: z.number().optional().nullable(),
  alertDateStep: z.number().optional().default(30),
  note: z.string().optional().nullable(),
  options: z.array(z.any()).optional().default([]),
  userId: z.number().optional().nullable(),
});

export const getExpiryAccountsParams = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('30'),
});
