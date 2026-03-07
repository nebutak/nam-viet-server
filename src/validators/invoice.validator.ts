import { z } from 'zod';

export const createInvoiceSchema = z.object({
  customerId: z.number().int().positive('ID khách hàng phải là số dương'),
  warehouseId: z.number().int().positive('ID kho phải là số dương').optional(),
  orderDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Ngày đặt hàng không hợp lệ')
    .optional(),
  salesChannel: z.enum(['retail', 'wholesale', 'online', 'distributor']).optional(),
  isPickupOrder: z.boolean().optional(), // true = lấy ngay, false = giao hàng
  paymentMethod: z.enum(['cash', 'transfer', 'installment', 'credit']),
  paidAmount: z.number().min(0, 'Số tiền thanh toán phải là số không âm').optional(),
  deliveryAddress: z.string().max(255).optional(),
  recipientName: z.string().max(255).optional(),
  recipientPhone: z.string().max(20).optional(),
  discountAmount: z.number().min(0, 'Số tiền giảm giá phải là số không âm').optional(),
  shippingFee: z.number().min(0, 'Phí vận chuyển phải là số không âm').optional(),
  notes: z.string().max(255).optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive('ID sản phẩm phải là số dương'),
        quantity: z.number().positive('Số lượng phải là số dương'),
        unitPrice: z.number().positive('Đơn giá phải là số dương'),
        discountPercent: z.number().min(0).max(100, 'Phần trăm giảm giá phải từ 0-100').optional(),
        taxRate: z.number().min(0).max(100, 'Thuế suất phải từ 0-100').optional(),
        warehouseId: z.number().int().positive().optional(),
        notes: z.string().max(255).optional(),
      })
    )
    .min(1, 'Đơn hàng phải có ít nhất một sản phẩm'),
});

export const updateInvoiceSchema = z.object({
  orderDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Ngày đặt hàng không hợp lệ')
    .optional(),
  salesChannel: z.enum(['retail', 'wholesale', 'online', 'distributor']).optional(),
  deliveryAddress: z.string().max(255).optional(),
  discountAmount: z.number().min(0).optional(),
  shippingFee: z.number().min(0).optional(),
  notes: z.string().max(255).optional(),
});

export const approveOrderSchema = z.object({
  notes: z.string().max(255).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(10, 'Lý do hủy đơn phải có ít nhất 10 ký tự').max(255),
});

export const processPaymentSchema = z.object({
  paidAmount: z.number().positive('Số tiền thanh toán phải là số dương'),
  paymentMethod: z.enum(['cash', 'transfer', 'installment', 'credit']),
  notes: z.string().max(255).optional(),
});

export const invoiceQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().optional(),
  customerId: z.string().regex(/^\d+$/).transform(Number).optional(),
  warehouseId: z.string().regex(/^\d+$/).transform(Number).optional(),
  createdBy: z.string().regex(/^\d+$/).transform(Number).optional(),
  orderStatus: z.union([
    z.enum(['pending', 'preparing', 'delivering', 'completed', 'cancelled']),
    z.array(z.enum(['pending', 'preparing', 'delivering', 'completed', 'cancelled'])),
  ]).optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
  salesChannel: z.enum(['retail', 'wholesale', 'online', 'distributor']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ApproveOrderInput = z.infer<typeof approveOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
export type InvoiceQueryInput = z.infer<typeof invoiceQuerySchema>;
