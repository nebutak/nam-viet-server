import { z } from 'zod';

export const taxQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    status: z.string().optional(),
});

export const taxIdSchema = z.object({
    id: z.string().regex(/^\d+$/, 'ID phải là số nguyên'),
});

export const createTaxSchema = z.object({
    title: z.string().min(1, 'Tên thuế không được để trống').max(100),
    percentage: z.number().min(0).max(100),
    priority: z.number().int().min(0).optional().default(0),
    status: z.string().optional().default('published'),
});

export const updateTaxSchema = z.object({
    title: z.string().min(1).max(100).optional(),
    percentage: z.number().min(0).max(100).optional(),
    priority: z.number().int().min(0).optional(),
    status: z.string().optional(),
});

export const bulkDeleteTaxSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1, 'Cần ít nhất 1 ID'),
});

export type TaxQueryInput = z.infer<typeof taxQuerySchema>;
export type CreateTaxInput = z.infer<typeof createTaxSchema>;
export type UpdateTaxInput = z.infer<typeof updateTaxSchema>;
