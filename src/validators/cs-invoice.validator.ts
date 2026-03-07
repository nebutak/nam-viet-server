import { z } from 'zod';

// ==========================================
// 1. CREATE SALES ORDER (CUSTOMER VERSION)
// ==========================================
export const createCustomerInvoiceSchema = z.object({
        // warehouseId: Admin bắt buộc, nhưng Khách có thể optional (nếu logic tự chọn kho)
        warehouseId: z.number().int().positive('Warehouse ID must be positive').optional(),

        // paymentMethod: Khách chỉ được dùng Tiền mặt hoặc Chuyển khoản (Không cho nợ/trả góp)
        paymentMethod: z.enum(['transfer', 'cash'])
            .refine((val) => ['transfer', 'cash'].includes(val), {
                 message: "Phương thức thanh toán phải là 'transfer' hoặc 'cash'."
            }),
        // [MỚI] Chi tiết thanh toán để sinh QR (Momo/Bank)
        // Bắt buộc nếu paymentMethod là 'transfer', nhưng ở đây để optional để validate logic chéo sau hoặc frontend tự gửi
        paymentMethodDetail: z.enum(['MOMO_QR', 'MBBANK_QR', 'BANK_TRANSFER']).optional(),

        // paidAmount: Số tiền trả trước (thường là 0 hoặc full)
        paidAmount: z.number().min(0, 'Paid amount must be non-negative').optional(),

        // deliveryAddress: Địa chỉ giao hàng
        deliveryAddress: z.string().max(255).optional(),

        // Các trường voucher/ship (Admin có thể tự nhập, Khách thường do hệ thống tính, nhưng cho phép gửi lên để tham chiếu)
        discountAmount: z.number().min(0).optional(),
        shippingFee: z.number().min(0).optional(),
        
        notes: z.string().max(255).optional(),

        // Chi tiết sản phẩm (Cấu trúc Giống hệt Admin)
        items: z
            .array(
                z.object({
                    productId: z.number().int().positive('Product ID must be positive'),
                    quantity: z.number().positive('Quantity must be positive'),
                    
                    // unitPrice: Vẫn validate để đảm bảo frontend không gửi rác.
                    // Tuy nhiên, Service sẽ GHI ĐÈ giá này bằng giá từ Database để bảo mật.
                    unitPrice: z.number().positive('Unit price must be positive').optional(),
                    
                    discountPercent: z.number().min(0).max(100).optional(),
                    taxRate: z.number().min(0).max(100).optional(),
                    warehouseId: z.number().int().positive().optional(),
                    notes: z.string().max(255).optional(),
                })
            )
            .min(1, 'Đơn hàng phải có ít nhất 1 sản phẩm.'),
});

export const createCustomerInvoiceSchema1 = z.object({
    body: z.object({
        // warehouseId: Admin bắt buộc, nhưng Khách có thể optional (nếu logic tự chọn kho)
        warehouseId: z.number().int().positive('Warehouse ID must be positive').optional(),

        // paymentMethod: Khách chỉ được dùng Tiền mặt hoặc Chuyển khoản (Không cho nợ/trả góp)
        paymentMethod: z.enum(['transfer', 'cash'])
            .refine((val) => ['transfer', 'cash'].includes(val), {
                 message: "Phương thức thanh toán phải là 'transfer' hoặc 'cash'."
            }),
        // [MỚI] Chi tiết thanh toán để sinh QR (Momo/Bank)
        // Bắt buộc nếu paymentMethod là 'transfer', nhưng ở đây để optional để validate logic chéo sau hoặc frontend tự gửi
        paymentMethodDetail: z.enum(['MOMO_QR', 'MBBANK_QR', 'BANK_TRANSFER']).optional(),

        // paidAmount: Số tiền trả trước (thường là 0 hoặc full)
        paidAmount: z.number().min(0, 'Paid amount must be non-negative').optional(),

        // deliveryAddress: Địa chỉ giao hàng
        deliveryAddress: z.string().max(255).optional(),

        // Các trường voucher/ship (Admin có thể tự nhập, Khách thường do hệ thống tính, nhưng cho phép gửi lên để tham chiếu)
        discountAmount: z.number().min(0).optional(),
        shippingFee: z.number().min(0).optional(),
        
        notes: z.string().max(255).optional(),

        // Chi tiết sản phẩm (Cấu trúc Giống hệt Admin)
        items: z
            .array(
                z.object({
                    productId: z.number().int().positive('Product ID must be positive'),
                    quantity: z.number().positive('Quantity must be positive'),
                    
                    // unitPrice: Vẫn validate để đảm bảo frontend không gửi rác.
                    // Tuy nhiên, Service sẽ GHI ĐÈ giá này bằng giá từ Database để bảo mật.
                    unitPrice: z.number().positive('Unit price must be positive').optional(),
                    
                    discountPercent: z.number().min(0).max(100).optional(),
                    taxRate: z.number().min(0).max(100).optional(),
                    warehouseId: z.number().int().positive().optional(),
                    notes: z.string().max(255).optional(),
                })
            )
            .min(1, 'Đơn hàng phải có ít nhất 1 sản phẩm.'),
    }),
});

// ==========================================
// 2. INITIATE PAYMENT (Thanh toán Online sau khi tạo đơn)
// ==========================================
export const initiateCustomerPaymentSchema = z.object({
    body: z.object({
        amount: z.number().positive().optional(),
        
        // Bắt buộc chọn cổng thanh toán
        paymentMethodDetail: z.enum(['MOMO_QR', 'MBBANK_QR', 'BANK_TRANSFER'])
            .optional()
            .refine((val) => {
                if (!val) return true; // Cho phép undefined vì là optional
                return ['MOMO_QR', 'MBBANK_QR', 'BANK_TRANSFER'].includes(val);
            }, {
                message: "Cổng thanh toán phải là MOMO_QR, MBBANK_QR hoặc BANK_TRANSFER."
            }),
        
        notes: z.string().max(255).optional(),
    }),
});

// ==========================================
// 3. CANCEL ORDER (Khách tự hủy)
// ==========================================
export const customerCancelOrderSchema = z.object({
    body: z.object({
        reason: z.string().min(5, 'Lý do hủy phải có ít nhất 5 ký tự.').max(255),
    }),
});

// ==========================================
// 4. QUERY ORDERS (Lấy danh sách đơn của tôi)
// Dựa trên invoiceQuerySchema của Admin nhưng bỏ các trường nhạy cảm
// ==========================================
export const customerInvoiceQuerySchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).optional(),
        
        // Khách có thể tìm theo mã đơn của chính mình
        search: z.string().optional(),
        
        // Không cho phép lọc customerId (vì chỉ xem đc của mình)
        // customerId: z.string().... -> BỎ

        orderStatus: z.enum(['pending', 'preparing', 'delivering', 'completed', 'cancelled']).optional(),
        paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
        
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        
        // Sắp xếp
        sortBy: z.string().optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
    }),
});

// ==========================================
// TYPES
// ==========================================
export type CreateCustomerInvoiceInput = z.infer<typeof createCustomerInvoiceSchema>;
export type InitiateCustomerPaymentInput = z.infer<typeof initiateCustomerPaymentSchema>['body'];
export type CustomerCancelOrderInput = z.infer<typeof customerCancelOrderSchema>['body'];
export type CustomerInvoiceQueryInput = z.infer<typeof customerInvoiceQuerySchema>['query'];