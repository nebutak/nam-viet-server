import { z } from 'zod';

export const unitQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const createUnitSchema = z.object({
    unitCode: z.string().min(1, 'Mã đơn vị tính là bắt buộc').max(50, 'Mã không được vượt quá 50 ký tự'),
    unitName: z.string().min(1, 'Tên đơn vị tính là bắt buộc').max(100, 'Tên không được vượt quá 100 ký tự'),
    description: z.string().max(255).optional().nullable(),
    status: z.enum(['active', 'inactive']).optional(),
});

export const updateUnitSchema = createUnitSchema.partial();

export const updateUnitStatusSchema = z.object({
    status: z.enum(['active', 'inactive']),
});

export const unitIdSchema = z.object({
    id: z.string().regex(/^\d+$/, 'ID phải là một số hợp lệ'),
});

export const bulkDeleteUnitSchema = z.object({
    ids: z.array(z.number()).min(1, 'Phải chọn ít nhất 1 đơn vị tính'),
});

export type UnitQueryInput = z.infer<typeof unitQuerySchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type UpdateUnitStatusInput = z.infer<typeof updateUnitStatusSchema>;
