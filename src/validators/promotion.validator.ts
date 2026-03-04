import { z } from 'zod';

// Promotion Types Enum
export const promotionTypeEnum = z.enum([
  'buy_x_get_y',
  'gift',
]);

export const applicableToEnum = z.enum([
  'all',
  'category',
  'product_group',
  'specific_product',
  'customer_group',
  'specific_customer',
]);

export const promotionStatusEnum = z.enum(['pending', 'active', 'expired', 'cancelled']);

// Conditions Schema (JSON)
export const conditionsSchema = z.object({
  applicables_categories: z.array(z.number()).optional(),
  applicable_customer_types: z.array(z.string()).optional(),
  days_of_week: z.array(z.number().min(0).max(6)).optional(),
  time_slots: z.array(z.string()).optional(),
  max_usage_per_customer: z.number().optional(),
  buy_quantity: z.number().optional(),
  get_quantity: z.number().optional(),
  get_same_product: z.boolean().optional(),
  gift_product_id: z.number().optional(),
  gift_quantity: z.number().optional(),
  customer_id: z.number().optional(),
});

// Query Schema
export const promotionQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().optional(),
  promotionType: promotionTypeEnum.optional(),
  status: promotionStatusEnum.optional(),
  applicableTo: applicableToEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Create Promotion Schema
export const createPromotionSchema = z.object({
  promotionCode: z.string().min(1, 'Mã khuyến mãi là bắt buộc').max(50),
  promotionName: z.string().min(1, 'Tên khuyến mãi là bắt buộc').max(200),
  promotionType: promotionTypeEnum,
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Ngày bắt đầu không hợp lệ',
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Ngày kết thúc không hợp lệ',
  }),
  isRecurring: z.boolean().optional(),
  applicableTo: applicableToEnum,
  minOrderValue: z.number().min(0).optional(),
  minQuantity: z.number().min(0).optional(),
  conditions: conditionsSchema.optional(),
  quantityLimit: z.number().min(1).optional(),
  products: z
    .array(
      z.object({
        productId: z.number().min(0),
        discountValueOverride: z.number().min(0).optional(),
        minQuantity: z.number().min(0).optional(),
        giftProductId: z.number().min(1).optional(),
        giftQuantity: z.number().min(0).optional(),
        note: z.string().max(255).optional(),
      })
    )
    .optional(),
});

// Update Promotion Schema
export const updatePromotionSchema = z.object({
  promotionName: z.string().min(1).max(200).optional(),
  promotionType: promotionTypeEnum.optional(),
  applicableTo: applicableToEnum.optional(),
  startDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Ngày bắt đầu không hợp lệ',
    })
    .optional(),
  endDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Ngày kết thúc không hợp lệ',
    })
    .optional(),
  isRecurring: z.boolean().optional(),
  minOrderValue: z.number().min(0).optional(),
  minQuantity: z.number().min(0).optional(),
  conditions: conditionsSchema.optional(),
  quantityLimit: z.number().min(1).optional(),
  products: z
    .array(
      z.object({
        productId: z.number().min(0),
        discountValueOverride: z.number().min(0).optional(),
        minQuantity: z.number().min(0).optional(),
        giftProductId: z.number().min(1).optional(),
        giftQuantity: z.number().min(0).optional(),
        note: z.string().max(255).optional(),
      })
    )
    .optional(),
});

// Approve Promotion Schema
export const approvePromotionSchema = z.object({
  notes: z.string().max(500).optional(),
});

// Cancel Promotion Schema
export const cancelPromotionSchema = z.object({
  reason: z.string().max(500).optional(),
});

// Apply Promotion Schema
export const applyPromotionSchema = z.object({
  orderId: z.number().min(1).optional(),
  orderAmount: z.number().min(0),
  orderItems: z
    .array(
      z.object({
        productId: z.number().min(1),
        quantity: z.number().min(1),
        unitPrice: z.number().min(0),
      })
    )
    .min(1, 'Đơn hàng phải có ít nhất một sản phẩm'),
  customerId: z.number().min(1).optional(),
  customerType: z.string().optional(),
});

// Get Active Promotions Schema
export const getActivePromotionsSchema = z.object({
  date: z.string().optional(),
  applicableTo: applicableToEnum.optional(),
  productId: z.string().regex(/^\d+$/).transform(Number).optional(),
  categoryId: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: promotionStatusEnum.optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export type PromotionQueryInput = z.infer<typeof promotionQuerySchema>;
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
export type ApplyPromotionInput = z.infer<typeof applyPromotionSchema>;
