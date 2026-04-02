import { z } from 'zod';

export const createInvoiceSchema = z.object({
  customerId: z.union([
    z.number().int().positive(),
    z.string().transform((val) => Number(val)).refine((val) => val > 0, 'ID khách hàng phải là số dương')
  ]).optional().nullable(),
  warehouseId: z.number().int().positive('ID kho phải là số dương').optional(),
  orderDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Ngày đặt hàng không hợp lệ')
    .optional(),

  taxAmount: z.number().optional(),
  amount: z.number().optional(),
  totalAmount: z.number().optional(),
  expectedDeliveryDate: z.string().optional().nullable(),
  requireApproval: z.boolean().optional(),
  salesChannel: z.enum(['retail', 'wholesale', 'online', 'distributor']).optional(),
  isPickupOrder: z.boolean().optional(), // true = lấy ngay, false = giao hàng
  // paymentMethod might be absent or optional now based on previous requests
  paymentMethod: z.enum(['cash', 'transfer', 'installment', 'credit']).optional(),
  paidAmount: z.number().min(0, 'Số tiền thanh toán phải là số không âm').optional(),
  deliveryAddress: z.string().max(255).optional(),
  recipientName: z.string().max(255).optional(),
  recipientPhone: z.string().max(20).optional(),
  promotionId: z.number().int().positive('ID khuyến mãi phải là số dương').optional(),
  discountAmount: z.number().min(0, 'Số tiền giảm giá phải là số không âm').optional(),
  shippingFee: z.number().min(0, 'Phí vận chuyển phải là số không âm').optional(),
  notes: z.string().max(255).optional(),
  newCustomer: z.object({
    customerName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    cccd: z.string().optional(),
    issuedAt: z.string().optional().nullable(),
    issuedBy: z.string().optional().nullable(),
  }).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive('ID sản phẩm phải là số dương'),
        unitId: z.number().optional(),
        unitName: z.string().optional(),
        productName: z.string().optional(),
        productType: z.string().optional(),
        quantity: z.number().positive('Số lượng phải là số dương'),
        baseQuantity: z.number().optional(),
        conversionFactor: z.number().optional(),
        unitPrice: z.number().positive('Đơn giá phải là số dương').optional(),
        price: z.number().optional(), // FE current sends price instead of unitPrice
        discountPercent: z.number().min(0).max(100, 'Phần trăm giảm giá phải từ 0-100').optional(),
        discountRate: z.number().optional(),
        discountAmount: z.number().optional(),
        taxRate: z.union([z.number(), z.string()]).optional(),
        taxIds: z.array(z.number()).optional(),
        taxAmount: z.number().optional(),

        total: z.number().optional(),
        periodMonths: z.union([z.number(), z.string()]).optional(),
        warrantyCost: z.union([z.number(), z.string()]).optional(),
        applyWarranty: z.boolean().optional(),
        warehouseId: z.number().int().positive().optional(),
        notes: z.string().max(255).optional(),
        gift: z.boolean().optional(),
        isGift: z.boolean().optional(),
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
  customerId: z.union([
    z.number().int().positive(),
    z.string().transform((val) => Number(val)).refine((val) => val > 0, 'ID khách hàng phải là số dương')
  ]).optional().nullable(),
  newCustomer: z.object({
    customerName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    cccd: z.string().optional(),
    issuedAt: z.string().optional().nullable(),
    issuedBy: z.string().optional().nullable(),
  }).optional().nullable(),
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
