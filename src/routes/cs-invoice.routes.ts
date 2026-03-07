import { Router } from 'express';
import { asyncHandler } from '@middlewares/errorHandler'; // Bắt buộc để bắt lỗi async
import { validateNested } from '@middlewares/validate';
// Middleware xác thực khách hàng (đảm bảo req.user tồn tại)
import { customerAuthentication } from '@middlewares/authCustomer'; 

// Import Controller (đã export default new Controller)
import customerInvoiceController from '@controllers/cs-invoice.controller'; 

// Import Validators
import { 
    createCustomerInvoiceSchema1,
    // initiateCustomerPaymentSchema,
    customerCancelOrderSchema,
    // customerInvoiceQuerySchema // Import thêm cái này từ bước trước
} from '@validators/cs-invoice.validator'; 

const router = Router();

// ==========================================
// MIDDLEWARES
// ==========================================
// Áp dụng xác thực cho toàn bộ các routes bên dưới
router.use(customerAuthentication); 


// ==========================================
// ROUTES
// ==========================================

/**
 * @route POST /api/v1/customer/orders
 * @description Tạo đơn hàng mới
 */
router.post(
    '/',
    // Validate BODY
    validateNested(createCustomerInvoiceSchema1), 
    // Dùng asyncHandler và .bind()
    asyncHandler(customerInvoiceController.createOrder.bind(customerInvoiceController))
);

/**
 * @route GET /api/v1/customer/orders
 * @description Xem danh sách đơn hàng của tôi
 */
router.get(
    '/',
    // Validate QUERY params (page, limit, status...)
    // validateNested(customerInvoiceQuerySchema), 
    asyncHandler(customerInvoiceController.getMyOrders.bind(customerInvoiceController))
);

/**
 * @route GET /api/v1/customer/orders/:id
 * @description Xem chi tiết 1 đơn hàng
 */
router.get(
    '/:id',
    // (Optional) Có thể validate params id là số ở đây nếu muốn
    asyncHandler(customerInvoiceController.getMyOrderDetail.bind(customerInvoiceController))
);

/**
 * @route POST /api/v1/customer/orders/:id/payment
 * @description Khởi tạo thanh toán Online (lấy QR)
 * Lưu ý: Dùng POST thay vì GET vì có thể gửi kèm thông tin methodDetail trong body
 */
// router.post(
//     '/:id/payment',
//     validateNested(initiateCustomerPaymentSchema),
//     asyncHandler(customerInvoiceController.initiatePayment.bind(customerInvoiceController))
// );

// /**
//  * @route PUT /api/v1/customer/orders/:id/cancel
//  * @description Hủy đơn hàng
//  */
router.put(
    '/:id/cancel',
    validateNested(customerCancelOrderSchema),
    asyncHandler(customerInvoiceController.cancelOrder.bind(customerInvoiceController))
);

export default router;