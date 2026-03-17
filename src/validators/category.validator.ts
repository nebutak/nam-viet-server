import { z } from 'zod';

export const createCategorySchema = z.object({
  categoryCode: z
    .string()
    .min(1, 'Category code is required')
    .max(50, 'Category code too long')
    .regex(/^[A-Z0-9-]+$/, 'Category code must be uppercase alphanumeric with hyphens')
    .trim(),
  categoryName: z
    .string()
    .min(1, 'Category name is required')
    .max(200, 'Category name too long')
    .trim(),
  parentId: z.number().int().positive('Invalid parent category ID').nullable().optional(),
  type: z.enum(['PRODUCT', 'MATERIAL']).optional().default('PRODUCT'),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateCategorySchema = z.object({
  categoryCode: z
    .string()
    .max(50, 'Category code too long')
    .regex(/^[A-Z0-9-]+$/, 'Category code must be uppercase alphanumeric with hyphens')
    .trim()
    .optional(),
  categoryName: z.string().max(200, 'Category name too long').trim().optional(),
  parentId: z.number().int().positive('Invalid parent category ID').nullable().optional(),
  type: z.enum(['PRODUCT', 'MATERIAL']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const queryCategoriesSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().trim().optional(),
  // parentId can be:
  // - a number string (e.g., "123") - filter by parent ID
  // - "null" string - filter root categories (where parentId is null)
  // - undefined - no filter (get all)
  parentId: z
    .string()
    .refine((val) => val === 'null' || /^\d+$/.test(val), {
      message: 'parentId must be a number or "null"',
    })
    .optional(),
  type: z.enum(['PRODUCT', 'MATERIAL']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'categoryName', 'categoryCode'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive'], { message: 'Trạng thái không hợp lệ' }),
});

export const bulkDeleteCategorySchema = z.object({
  ids: z.array(z.number().int().positive(), { message: 'Danh sách ID không hợp lệ' }).min(1, 'Vui lòng chọn ít nhất một danh mục'),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type QueryCategoriesInput = z.infer<typeof queryCategoriesSchema>;
export type UpdateCategoryStatusInput = z.infer<typeof updateStatusSchema>;
export type BulkDeleteCategoryInput = z.infer<typeof bulkDeleteCategorySchema>;
