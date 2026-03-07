import { z } from 'zod';

export const createMaterialSchema = z.object({
    materialCode: z
        .string()
        .min(1, 'Mã nguyên liệu là bắt buộc')
        .max(50, 'Mã nguyên liệu tối đa 50 ký tự')
        .trim(),
    name: z
        .string()
        .min(1, 'Tên nguyên liệu là bắt buộc')
        .max(200, 'Tên nguyên liệu tối đa 200 ký tự')
        .trim(),
    cost: z
        .number({ message: 'Giá thành phải là số' })
        .min(0, 'Giá thành không được âm'),
    supplierId: z.number().int().positive().optional().nullable(),
    categoryId: z.number().int().positive().optional().nullable(),
    unit: z.string().max(50, 'Đơn vị tính tối đa 50 ký tự').optional().nullable(),
    materialType: z.string().max(100, 'Loại nguyên liệu tối đa 100 ký tự').optional().nullable(),
    priority: z
        .number()
        .int()
        .min(0, 'Độ ưu tiên tối thiểu là 0')
        .max(6, 'Độ ưu tiên tối đa là 6')
        .optional()
        .default(0),
    purchaseDate: z.string().optional().nullable(),
    effectiveDate: z.string().optional().nullable(),
    imageUrl: z.string().max(500).optional().nullable(),
});

export const updateMaterialSchema = z.object({
    materialCode: z
        .string()
        .min(1, 'Mã nguyên liệu là bắt buộc')
        .max(50, 'Mã nguyên liệu tối đa 50 ký tự')
        .trim()
        .optional(),
    name: z
        .string()
        .min(1, 'Tên nguyên liệu là bắt buộc')
        .max(200, 'Tên nguyên liệu tối đa 200 ký tự')
        .trim()
        .optional(),
    cost: z
        .number({ message: 'Giá thành phải là số' })
        .min(0, 'Giá thành không được âm')
        .optional(),
    supplierId: z.number().int().positive().optional().nullable(),
    categoryId: z.number().int().positive().optional().nullable(),
    unit: z.string().max(50, 'Đơn vị tính tối đa 50 ký tự').optional().nullable(),
    materialType: z.string().max(100, 'Loại nguyên liệu tối đa 100 ký tự').optional().nullable(),
    priority: z
        .number()
        .int()
        .min(0, 'Độ ưu tiên tối thiểu là 0')
        .max(6, 'Độ ưu tiên tối đa là 6')
        .optional(),
    purchaseDate: z.string().optional().nullable(),
    effectiveDate: z.string().optional().nullable(),
    imageUrl: z.string().max(500).optional().nullable(),
});

export const queryMaterialsSchema = z.object({
    page: z.string().regex(/^\d+$/, 'Số trang phải là số nguyên dương').optional().default('1'),
    limit: z.string().regex(/^\d+$/, 'Số bản ghi phải là số nguyên dương').optional().default('20'),
    search: z.string().trim().optional(),
    sortBy: z
        .enum(['createdAt', 'updatedAt', 'name', 'cost', 'priority', 'materialCode'])
        .optional()
        .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type QueryMaterialsInput = z.infer<typeof queryMaterialsSchema>;
