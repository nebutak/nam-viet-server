import { z } from 'zod';

export const createSupplierSchema = z.object({
  supplierCode: z
    .string()
    .min(1, 'Mã nhà cung cấp là bắt buộc')
    .max(50, 'Mã nhà cung cấp quá dài')
    .regex(/^[A-Z0-9-]+$/, 'Mã nhà cung cấp phải là chữ in hoa, số và dấu gạch ngang')
    .trim(),
  supplierName: z
    .string()
    .min(1, 'Tên nhà cung cấp là bắt buộc')
    .max(200, 'Tên nhà cung cấp quá dài')
    .trim(),
  supplierType: z.enum(['local', 'foreign']).optional().default('local'),
  contactName: z.string().max(100, 'Tên người liên hệ quá dài').optional(),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[0-9]{10,11}$/.test(val),
      'Số điện thoại không hợp lệ (10-11 chữ số)'
    ),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  address: z.string().max(255, 'Địa chỉ quá dài').optional(),
  taxCode: z
    .string()
    .max(50, 'Mã số thuế quá dài')
    .optional()
    .refine(
      (val) => !val || /^[0-9-]+$/.test(val),
      'Mã số thuế chỉ được chứa số và dấu gạch ngang'
    ),
  paymentTerms: z.string().max(255, 'Điều khoản thanh toán quá dài').optional(),
  notes: z.string().max(500, 'Ghi chú quá dài').optional(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateSupplierSchema = z.object({
  supplierCode: z
    .string()
    .max(50, 'Mã nhà cung cấp quá dài')
    .regex(/^[A-Z0-9-]+$/, 'Mã nhà cung cấp phải là chữ in hoa, số và dấu gạch ngang')
    .trim()
    .optional(),
  supplierName: z.string().max(200, 'Tên nhà cung cấp quá dài').trim().optional(),
  supplierType: z.enum(['local', 'foreign']).optional(),
  contactName: z.string().max(100, 'Tên người liên hệ quá dài').nullable().optional(),
  phone: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^[0-9]{10,11}$/.test(val),
      'Số điện thoại không hợp lệ (10-11 chữ số)'
    ),
  email: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || z.string().email().safeParse(val).success, 'Email không hợp lệ'),
  address: z.string().max(255, 'Địa chỉ quá dài').nullable().optional(),
  taxCode: z
    .string()
    .max(50, 'Mã số thuế quá dài')
    .nullable()
    .optional()
    .refine(
      (val) => !val || /^[0-9-]+$/.test(val),
      'Mã số thuế chỉ được chứa số và dấu gạch ngang'
    ),
  paymentTerms: z.string().max(255, 'Điều khoản thanh toán quá dài').nullable().optional(),
  notes: z.string().max(500, 'Ghi chú quá dài').nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const updateSupplierStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const querySuppliersSchema = z.object({
  page: z.string().regex(/^\d+$/, 'Số trang phải là số nguyên dương').optional().default('1'),
  limit: z.string().regex(/^\d+$/, 'Số bản ghi phải là số nguyên dương').optional().default('20'),
  search: z.string().trim().optional(),
  supplierType: z.enum(['local', 'foreign']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'supplierName', 'supplierCode'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type UpdateSupplierStatusInput = z.infer<typeof updateSupplierStatusSchema>;
export type QuerySuppliersInput = z.infer<typeof querySuppliersSchema>;
