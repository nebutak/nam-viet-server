import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z
    .string()
    .min(1, 'SKU là bắt buộc')
    .max(50, 'SKU quá dài')
    .regex(/^[A-Z0-9-]+$/, 'SKU phải là chữ hoa, số và dấu gạch ngang')
    .trim()
    .optional(),
  productName: z
    .string()
    .min(1, 'Tên sản phẩm là bắt buộc')
    .max(200, 'Tên sản phẩm quá dài')
    .trim(),
  productType: z
    .enum(['raw_material', 'packaging', 'finished_product', 'goods'])
    .refine((val) => !!val, { message: 'Loại sản phẩm không hợp lệ' }),
  packagingType: z
    .enum(['bottle', 'box', 'bag', 'label', 'other'])
    .refine((val) => !!val, { message: 'Loại bao bì không hợp lệ' })
    .optional()
    .default('other'),
  categoryId: z.number().int().positive('ID danh mục không hợp lệ').optional(),
  supplierId: z.number().int().positive('ID nhà cung cấp không hợp lệ').optional(),
  unitId: z.number().int().positive('Đơn vị tính không hợp lệ').optional(),
  barcode: z.string().max(100, 'Mã vạch quá dài').optional(),
  weight: z.number().positive('Trọng lượng phải dương').optional(),
  dimensions: z.string().max(100, 'Kích thước quá dài').optional(),
  description: z.string().max(500, 'Mô tả quá dài').optional(),
  purchasePrice: z.number().min(0, 'Giá mua không thể âm').optional(),
  sellingPriceRetail: z.number().min(0, 'Giá bán lẻ không thể âm').optional(),
  sellingPriceWholesale: z.number().min(0, 'Giá bán sỉ không thể âm').optional(),
  sellingPriceVip: z.number().min(0, 'Giá VIP không thể âm').optional(),
  taxRate: z
    .number()
    .min(0, 'Thuế suất không thể âm')
    .max(100, 'Thuế suất không thể vượt quá 100%')
    .optional()
    .default(0),
  minStockLevel: z.number().min(0, 'Tồn kho tối thiểu không thể âm').optional().default(0),
  expiryDate: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const date = new Date(val);
      return isNaN(date.getTime()) ? undefined : date.toISOString();
    }),
  status: z.enum(['active', 'inactive', 'discontinued']).optional().default('active'),
});

export const updateProductSchema = z.object({
  sku: z
    .string()
    .min(1, 'SKU không thể trống')
    .max(50, 'SKU quá dài')
    .regex(/^[A-Z0-9-]+$/, 'SKU phải là chữ hoa, số và dấu gạch ngang')
    .trim()
    .optional(),
  productName: z.string().min(1, 'Tên sản phẩm không thể trống').max(200).trim().optional(),
  productType: z
    .enum(['raw_material', 'packaging', 'finished_product', 'goods'])
    .refine((val) => !!val, { message: 'Loại sản phẩm không hợp lệ' })
    .optional(),
  packagingType: z
    .enum(['bottle', 'box', 'bag', 'label', 'other'])
    .refine((val) => !!val, { message: 'Loại bao bì không hợp lệ' })
    .optional(),
  categoryId: z.number().int().positive('ID danh mục không hợp lệ').nullable().optional(),
  supplierId: z.number().int().positive('ID nhà cung cấp không hợp lệ').nullable().optional(),
  unitId: z.number().int().positive('Đơn vị tính không hợp lệ').nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  weight: z.number().positive('Trọng lượng phải dương').nullable().optional(),
  dimensions: z.string().max(100).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  purchasePrice: z.number().min(0, 'Giá mua không thể âm').nullable().optional(),
  sellingPriceRetail: z.number().min(0, 'Giá bán lẻ không thể âm').nullable().optional(),
  sellingPriceWholesale: z.number().min(0, 'Giá bán sỉ không thể âm').nullable().optional(),
  sellingPriceVip: z.number().min(0, 'Giá VIP không thể âm').nullable().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  minStockLevel: z.number().min(0).optional(),
  expiryDate: z
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (!val) return null;
      const date = new Date(val);
      return isNaN(date.getTime()) ? null : date.toISOString();
    }),
  status: z.enum(['active', 'inactive', 'discontinued']).optional(),
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
  productType: z
    .union([
      z.enum(['raw_material', 'packaging', 'finished_product', 'goods']),
      z.array(z.enum(['raw_material', 'packaging', 'finished_product', 'goods'])),
    ])
    .optional()
    .transform((val) => {
      if (typeof val === 'string') return [val];
      return val;
    }),
  packagingType: z
    .enum(['bottle', 'box', 'bag', 'label', 'other'])
    .refine((val) => !!val, { message: 'Loại bao bì không hợp lệ!' })
    .optional(),
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
    .enum(['active', 'inactive', 'discontinued'])
    .refine((val) => !!val, { message: 'Trạng thái không hợp lệ!' })
    .optional(),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .refine((val) => !!val, { message: 'Sắp xếp không hợp lệ!' })
    .optional()
    .default('desc'),
  isFeatured: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
});

export const productIdSchema = z.object({
  id: z.string().transform(Number),
});

export const uploadProductImagesSchema = z.object({
  images: z
    .array(
      z.object({
        imageType: z
          .enum(['thumbnail', 'gallery', 'main'])
          .refine((val) => !!val, { message: 'Loại hình ảnh không hợp lệ' })
          .optional()
          .default('gallery'),
        altText: z.string().max(255).optional(),
        isPrimary: z.boolean().optional().default(false),
        displayOrder: z.number().int().min(0).optional().default(0),
      })
    )
    .min(1, 'Phải có ít nhất một hình ảnh')
    .max(5, 'Tối đa 5 hình ảnh'),
});

export const uploadProductVideosSchema = z.object({
  videos: z
    .array(
      z.object({
        videoType: z
          .enum(['demo', 'tutorial', 'review', 'unboxing', 'promotion', 'other'])
          .refine((val) => !!val, { message: 'Loại video không hợp lệ' })
          .optional()
          .default('demo'),
        title: z.string().max(255).optional(),
        description: z.string().max(500).optional(),
        isPrimary: z.boolean().optional().default(false),
        displayOrder: z.number().int().min(0).optional().default(0),
      })
    )
    .min(1, 'Phải có ít nhất một video')
    .max(5, 'Tối đa 5 video'),
});

export const deleteImageSchema = z.object({
  imageId: z.string().transform(Number),
});

export const deleteVideoSchema = z.object({
  videoId: z.string().transform(Number),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateFeaturedInput = z.infer<typeof updateFeaturedSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type ProductIdInput = z.infer<typeof productIdSchema>;
export type UploadProductImagesInput = z.infer<typeof uploadProductImagesSchema>;
export type UploadProductVideosInput = z.infer<typeof uploadProductVideosSchema>;
export type DeleteImageInput = z.infer<typeof deleteImageSchema>;
export type DeleteVideoInput = z.infer<typeof deleteVideoSchema>;
