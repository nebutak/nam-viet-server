import { z } from 'zod';

export const createWarehouseSchema = z.object({
  warehouseCode: z
    .string()
    .min(1, 'Mã kho là bắt buộc')
    .max(50, 'Mã kho quá dài')
    .regex(/^[A-Z0-9-]+$/, 'Mã kho phải là chữ số viết hoa có dấu gạch ngang.')
    .trim(),
  warehouseName: z.string().min(1, 'Tên kho là bắt buộc').max(200, 'Tên kho quá dài').trim(),
  warehouseType: z
    .enum(['raw_material', 'product'])
    .refine((val) => !!val, { message: 'Loại kho không hợp lệ' }),
  address: z.string().max(255, 'Địa chỉ quá dài').optional(),
  city: z.string().max(100, 'Tên thành phố quá dài').optional(),
  region: z.string().max(100, 'Tên vùng quá dài').optional(),
  description: z.string().max(255, 'Mô tả quá dài').optional(),
  managerId: z.number().int().positive('ID người quản lý không hợp lệ').optional(),
  capacity: z.number().positive('Sức chứa phải là số dương').optional(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateWarehouseSchema = z.object({
  warehouseCode: z
    .string()
    .max(50, 'Warehouse code too long')
    .regex(/^[A-Z0-9-]+$/, 'Warehouse code must be uppercase alphanumeric with hyphens')
    .trim()
    .optional(),
  warehouseName: z.string().max(200, 'Warehouse name too long').trim().optional(),
  warehouseType: z.enum(['raw_material', 'product']).optional(),
  address: z.string().max(255, 'Address too long').optional(),
  city: z.string().max(100, 'City name too long').optional(),
  region: z.string().max(100, 'Region name too long').optional(),
  description: z.string().max(255, 'Description too long').optional(),
  managerId: z.number().int().positive('Invalid manager ID').nullable().optional(),
  capacity: z.number().positive('Capacity must be positive').nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const queryWarehousesSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().trim().optional(),
  warehouseType: z.enum(['raw_material', 'product']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  city: z.string().trim().optional(),
  region: z.string().trim().optional(),
  sortBy: z
    .enum([
      'createdAt',
      'updatedAt',
      'warehouseName',
      'warehouseCode',
      'warehouseType',
      'city',
      'capacity',
    ])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const updateWarehouseStatusSchema = z.object({
  status: z.enum(['active', 'inactive'], {
    message: 'Trạng thái không hợp lệ',
  }),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type QueryWarehousesInput = z.infer<typeof queryWarehousesSchema>;
