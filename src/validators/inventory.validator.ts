import { z } from 'zod';

export const inventoryQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().trim().optional(),
  warehouseId: z.string().optional().transform(Number),
  productId: z.string().optional().transform(Number),
  productIds: z.string().optional(), // Comma-separated product IDs
  productType: z.enum(['raw_material', 'packaging', 'finished_product', 'goods']).optional(),
  warehouseType: z.enum(['raw_material', 'packaging', 'finished_product', 'goods']).optional(),
  categoryId: z.string().optional().transform(Number),
  lowStock: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  outOfStock: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  sortBy: z.string().optional().default('productId'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const alertInventoryQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().trim().optional(),
  warehouseId: z.string().optional().transform(Number),
});

export const warehouseInventorySchema = z.object({
  warehouseId: z.string().transform(Number),
});

export const productInventorySchema = z.object({
  productId: z.string().transform(Number),
});

export const getProductAvailabilitySchema = z.object({
  id: z.coerce.number().int().positive('Product ID must be a valid positive number'),
});

export const checkInventorySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive('Invalid product ID'),
        warehouseId: z.number().int().positive('Invalid warehouse ID'),
        quantity: z.number().positive('Quantity must be positive'),
      })
    )
    .min(1, 'At least one item is required'),
});

export const updateInventorySchema = z.object({
  warehouseId: z.number().int().positive('Invalid warehouse ID'),
  productId: z.number().int().positive('Invalid product ID'),
  quantity: z.number().min(0, 'Quantity cannot be negative'),
  reservedQuantity: z.number().min(0, 'Reserved quantity cannot be negative').optional(),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason too long'),
});

export const adjustInventorySchema = z.object({
  warehouseId: z.number().int().positive('Invalid warehouse ID'),
  productId: z.number().int().positive('Invalid product ID'),
  adjustment: z.number().refine((val) => val !== 0, {
    message: 'Adjustment cannot be zero',
  }),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason too long'),
});

export const reserveInventorySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive('Invalid product ID'),
        warehouseId: z.number().int().positive('Invalid warehouse ID'),
        quantity: z.number().positive('Quantity must be positive'),
      })
    )
    .min(1, 'At least one item is required'),
  referenceType: z.string().min(1, 'Reference type is required'),
  referenceId: z.number().int().positive('Invalid reference ID'),
});

export const releaseReservedSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive('Invalid product ID'),
        warehouseId: z.number().int().positive('Invalid warehouse ID'),
        quantity: z.number().positive('Quantity must be positive'),
      })
    )
    .min(1, 'At least one item is required'),
  referenceType: z.string().min(1, 'Reference type is required'),
  referenceId: z.number().int().positive('Invalid reference ID'),
});

export type InventoryQueryInput = z.infer<typeof inventoryQuerySchema>;
export type AlertInventoryQueryInput = z.infer<typeof alertInventoryQuerySchema>;
export type WarehouseInventoryInput = z.infer<typeof warehouseInventorySchema>;
export type ProductInventoryInput = z.infer<typeof productInventorySchema>;
export type CheckInventoryInput = z.infer<typeof checkInventorySchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
export type ReserveInventoryInput = z.infer<typeof reserveInventorySchema>;
export type ReleaseReservedInput = z.infer<typeof releaseReservedSchema>;
export type GetProductAvailabilityInput = z.infer<typeof getProductAvailabilitySchema>;
