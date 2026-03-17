import { z } from 'zod';

export const createProductSchema = z.object({
  code: z.string().trim().optional(),
  productName: z
    .string()
    .min(1, 'Tên sản phẩm là bắt buộc')
    .max(200, 'Tên sản phẩm quá dài')
    .trim(),
  categoryId: z.number().or(z.string().transform(Number)).optional(),
  supplierId: z.number().or(z.string().transform(Number)).optional(),
  unitId: z.number().or(z.string().transform(Number)).optional(),
  unitValue: z.string().max(50).optional().nullable(),
  description: z.string().max(500, 'Mô tả quá dài').optional(),
  note: z.string().max(500).optional(),
  basePrice: z.union([z.number(), z.string().transform(Number)]).optional(),
  price: z.union([z.number(), z.string().transform(Number)]).optional(),
  minStockLevel: z.union([z.number(), z.string().transform(Number)]).optional().default(0),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  image: z.string().optional(),
  hasExpiry: z.boolean().optional().default(false),
  manageSerial: z.boolean().optional().default(false),
  type: z.enum(['PRODUCT', 'MATERIAL']).optional().default('PRODUCT'),
  // New fields added
  taxIds: z.array(z.number()).optional(),
  materialIds: z.array(z.number()).optional(),
  attributeIdsWithValue: z.array(z.object({
    attributeId: z.number().or(z.string().transform(Number)),
    value: z.string().optional()
  })).optional(),
  unitConversions: z.array(z.object({
    unitId: z.number().or(z.string().transform(Number)),
    conversionFactor: z.number().or(z.string().transform(Number))
  })).optional(),
  applyWarranty: z.boolean().optional(),
  warrantyPolicy: z.any().optional(),
});

export const updateProductSchema = z.object({
  code: z.string().trim().optional(),
  productName: z.string().min(1, 'Tên sản phẩm không thể trống').max(200).trim().optional(),
  categoryId: z.number().or(z.string().transform(Number)).nullable().optional(),
  supplierId: z.number().or(z.string().transform(Number)).nullable().optional(),
  unitId: z.number().or(z.string().transform(Number)).nullable().optional(),
  unitValue: z.string().max(50).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  basePrice: z.union([z.number(), z.string().transform(Number)]).nullable().optional(),
  price: z.union([z.number(), z.string().transform(Number)]).nullable().optional(),
  minStockLevel: z.union([z.number(), z.string().transform(Number)]).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  image: z.string().optional(),
  hasExpiry: z.boolean().optional(),
  manageSerial: z.boolean().optional(),
  type: z.enum(['PRODUCT', 'MATERIAL']).optional(),
  // New fields added
  taxIds: z.array(z.number()).optional(),
  materialIds: z.array(z.number()).optional(),
  attributeIdsWithValue: z.array(z.object({
    attributeId: z.number().or(z.string().transform(Number)),
    value: z.string().optional()
  })).optional(),
  unitConversions: z.array(z.object({
    unitId: z.number().or(z.string().transform(Number)),
    conversionFactor: z.number().or(z.string().transform(Number))
  })).optional(),
  applyWarranty: z.boolean().optional(),
  warrantyPolicy: z.any().optional(),
});

export const updateFeaturedSchema = z
  .object({
    action: z.enum(['set_featured', 'unset_featured', 'reset_all']),
    productIds: z.array(z.number().int().positive()).optional(),
  })
  .refine(
    (data) => {
      if (['set_featured', 'unset_featured'].includes(data.action)) {
        return data.productIds && data.productIds.length > 0;
      }
      return true;
    },
    {
      message: 'productIds is required for set/unset actions',
      path: ['productIds'],
    }
  );

export const productQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
  search: z.string().optional(),
  categoryId: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  warehouseId: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  supplierId: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  status: z
    .enum(['active', 'inactive'])
    .refine((val: any) => !!val, { message: 'Trạng thái không hợp lệ!' })
    .optional(),
  type: z.enum(['PRODUCT', 'MATERIAL']).optional(),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .refine((val) => !!val, { message: 'Sắp xếp không hợp lệ!' })
    .optional()
    .default('desc'),
});

export const productIdSchema = z.object({
  id: z.string().transform(Number),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateFeaturedInput = z.infer<typeof updateFeaturedSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type ProductIdInput = z.infer<typeof productIdSchema>;
// Image and video schemas removed - use single image field in Product model
