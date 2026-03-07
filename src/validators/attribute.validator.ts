import { z } from 'zod';

export const attributeQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    status: z.string().optional(),
});

export const attributeIdSchema = z.object({
    id: z.string().regex(/^\d+$/, 'ID phải là số nguyên'),
});

export const createAttributeSchema = z.object({
    name: z.string().min(1, 'Tên thuộc tính không được để trống').max(100),
    code: z.string().max(50).optional(),
    dataType: z.string().max(50).optional(),
    unit: z.string().max(50).optional(),
    description: z.string().max(255).optional(),
    status: z.string().optional().default('published'),
});

export const updateAttributeSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    code: z.string().max(50).optional(),
    dataType: z.string().max(50).optional(),
    unit: z.string().max(50).optional(),
    description: z.string().max(255).optional(),
    status: z.string().optional(),
});

export const bulkDeleteAttributeSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1, 'Cần ít nhất 1 ID'),
});

export type AttributeQueryInput = z.infer<typeof attributeQuerySchema>;
export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;
