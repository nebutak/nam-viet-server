import { z } from 'zod';

const purchaseOrderDetailSchema = z.object({
  productId: z.number().int().positive('ID sản phẩm không hợp lệ'),
  quantity: z.number().positive('Số lượng phải lớn hơn 0'),
  baseQuantity: z.number().min(0).optional(),
  conversionFactor: z.number().min(0).optional(),
  price: z.number().min(0, 'Đơn giá không được âm'),
  discountRate: z.number().min(0).max(100).optional(),
  discountAmount: z.number().min(0).optional(),
  taxRate: z.string().max(50).optional().nullable(),
  taxIds: z.array(z.number()).optional().nullable(),
  taxAmount: z.number().min(0).optional(),
  total: z.number().min(0).optional(),
  periodMonths: z.coerce.string().max(50).optional().nullable(),
  warrantyCost: z.number().min(0).optional(),
  applyWarranty: z.boolean().optional(),
  unitId: z.number().int().positive().optional().nullable(),
  unitName: z.string().max(50).optional().nullable(),
  notes: z.string().max(255, 'Ghi chú quá dài').optional().nullable(),
});

const updatePurchaseOrderDetailSchema = z.object({
  id: z.number().int().positive().optional(),
  productId: z.number().int().positive('ID sản phẩm không hợp lệ'),
  quantity: z.number().positive('Số lượng phải lớn hơn 0'),
  baseQuantity: z.number().min(0).optional(),
  conversionFactor: z.number().min(0).optional(),
  price: z.number().min(0, 'Đơn giá không được âm'),
  discountRate: z.number().min(0).max(100).optional(),
  discountAmount: z.number().min(0).optional(),
  taxRate: z.string().max(50).optional().nullable(),
  taxIds: z.array(z.number()).optional().nullable(),
  taxAmount: z.number().min(0).optional(),
  total: z.number().min(0).optional(),
  periodMonths: z.coerce.string().max(50).optional().nullable(),
  warrantyCost: z.number().min(0).optional(),
  applyWarranty: z.boolean().optional(),
  unitId: z.number().int().positive().optional().nullable(),
  unitName: z.string().max(50).optional().nullable(),
  notes: z.string().max(255, 'Ghi chú quá dài').optional().nullable(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.preprocess((val) => (typeof val === 'string' ? parseInt(val, 10) : val), z.number().int().positive('ID nhà cung cấp không hợp lệ')).optional().nullable(),
  newSupplier: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    taxCode: z.string().optional(),
  }).optional().nullable(),
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)')
    .or(z.date()),
  expectedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)')
    .or(z.date())
    .optional()
    .nullable(),
  subTotal: z.number().min(0).optional(),
  taxAmount: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
  otherCosts: z.number().min(0).optional(),
  totalAmount: z.number().min(0).optional(),
  notes: z.string().max(255, 'Ghi chú quá dài').optional().nullable(),
  isAutoApprove: z.boolean().optional(),
  details: z
    .array(purchaseOrderDetailSchema)
    .min(1, 'Phải có ít nhất một sản phẩm')
    .max(100, 'Tối đa 100 sản phẩm cho mỗi đơn đặt hàng'),
});

export const updatePurchaseOrderSchema = z.object({
  supplierId: z.preprocess((val) => (typeof val === 'string' ? parseInt(val, 10) : val), z.number().int().positive('ID nhà cung cấp không hợp lệ')).optional().nullable(),
  newSupplier: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    taxCode: z.string().optional(),
  }).optional().nullable(),
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)')
    .or(z.date())
    .optional(),
  expectedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)')
    .or(z.date())
    .optional()
    .nullable(),
  subTotal: z.number().min(0).optional(),
  taxAmount: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
  otherCosts: z.number().min(0).optional(),
  totalAmount: z.number().min(0).optional(),
  notes: z.string().max(255, 'Ghi chú quá dài').optional().nullable(),
  isAutoApprove: z.boolean().optional(),
  details: z
    .array(updatePurchaseOrderDetailSchema)
    .min(1, 'Phải có ít nhất một sản phẩm')
    .max(100, 'Tối đa 100 sản phẩm cho mỗi đơn đặt hàng')
    .optional(),
});

export const receivePurchaseOrderSchema = z.object({
  details: z
    .array(
      z.object({
        productId: z.number().int().positive('ID sản phẩm không hợp lệ'),
        quantity: z.number().positive('Số lượng phải lớn hơn 0'),
        price: z.number().min(0, 'Đơn giá không được âm'),
        batchNumber: z.string().max(100, 'Số lô quá dài').optional(),
        expiryDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)')
          .or(z.date())
          .optional(),
        notes: z.string().max(500, 'Ghi chú quá dài').optional().nullable(),
      })
    )
    .min(1, 'Phải có ít nhất một sản phẩm')
    .max(100, 'Tối đa 100 sản phẩm')
    .optional(),
  notes: z.string().max(500, 'Ghi chú quá dài').optional().nullable(),
});

export const purchaseOrderQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().trim().optional(),
  status: z.enum(['pending', 'approved', 'received', 'cancelled']).optional(),
  supplierId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const purchaseOrderIdSchema = z.object({
  id: z.string().transform(Number),
});

export const approvePurchaseOrderSchema = z.object({
  notes: z.string().max(500, 'Ghi chú quá dài').optional(),
});

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().max(500, 'Lý do quá dài').optional(),
});

export type PurchaseOrderQueryInput = z.infer<typeof purchaseOrderQuerySchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;
export type ApprovePurchaseOrderInput = z.infer<typeof approvePurchaseOrderSchema>;
export type CancelPurchaseOrderInput = z.infer<typeof cancelPurchaseOrderSchema>;
