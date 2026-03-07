import { Response } from 'express';
import { ApiResponse, AuthRequest } from '@custom-types/common.type';
import invoiceService from '@services/cs-invoice.service';
import { NotFoundError } from '@utils/errors';
import type {
    CreateCustomerInvoiceInput,
    InitiateCustomerPaymentInput,
    CustomerCancelOrderInput
} from '@validators/cs-invoice.validator';

class CustomerInvoiceController {

    private getCustomerId(req: AuthRequest): number {
        console.log("--- DEBUG AUTH ---");
        console.log("Req User:", req.user);
        console.log("Req Headers Auth:", req.headers.authorization);
        console.log("------------------");
        const customerId = (req.user as any)?.customerId || req.user?.id;
        if (!customerId) {
            throw new NotFoundError('Customer ID not found in token. Unauthorized.');
        }
        return customerId;
    }

    // ========================================================
    // 1. POST /api/customer/orders - TẠO ĐƠN HÀNG MỚI
    // ========================================================
    async createOrder(req: AuthRequest, res: Response) {
        const customerId = this.getCustomerId(req);
        const data = req.body as CreateCustomerInvoiceInput;

        // Service đã xử lý Transaction, Check kho, và Validate giá
        const result = await invoiceService.createOrder(customerId, data);

        const response: ApiResponse = {
            success: true,
            data: {
                order: result.order,         // Thông tin đơn hàng
                paymentInfo: result.paymentInfo // Thông tin QR Code (nếu có)
            },
            message: 'Đơn hàng đã được tạo thành công.',
            timestamp: new Date().toISOString(),
        };

        return res.status(201).json(response);
    }

    // ========================================================
    // 2. GET /api/customer/orders - DANH SÁCH ĐƠN HÀNG
    // ========================================================
    async getMyOrders(req: AuthRequest, res: Response) {
        const customerId = this.getCustomerId(req);
        // Gán customerId vào query để Service lọc chính chủ
        const query = { ...req.query, customerId } as any;

        const result = await invoiceService.getMyOrders(query);

        return res.status(200).json({
            success: true,
            data: result.data,
            meta: result.meta,
            timestamp: new Date().toISOString(),
        });
    }

    // ========================================================
    // 3. GET /api/customer/orders/:id - CHI TIẾT ĐƠN HÀNG
    // ========================================================
    async getMyOrderDetail(req: AuthRequest, res: Response) {
        const customerId = this.getCustomerId(req);
        const orderId = parseInt(req.params.id);

        if (isNaN(orderId)) {
            return res.status(400).json({ success: false, message: 'Order ID invalid' });
        }

        const order = await invoiceService.getOrderDetail(customerId, orderId);

        return res.status(200).json({
            success: true,
            data: order,
            timestamp: new Date().toISOString(),
        });
    }

    // ========================================================
    // 4. POST /api/customer/orders/:id/payment - THANH TOÁN LẠI (QR)
    // ========================================================
    async initiatePayment(req: AuthRequest, res: Response) {
        const customerId = this.getCustomerId(req);
        const orderId = parseInt(req.params.id);
        const data = req.body as InitiateCustomerPaymentInput;

        if (isNaN(orderId)) {
            return res.status(400).json({ success: false, message: 'Order ID invalid' });
        }

        const paymentInfo = await invoiceService.initiatePayment(customerId, orderId, data);

        return res.status(200).json({
            success: true,
            data: paymentInfo,
            message: 'Tạo mã thanh toán thành công.',
            timestamp: new Date().toISOString(),
        });
    }

    // ========================================================
    // 5. PUT /api/customer/orders/:id/cancel - HỦY ĐƠN
    // ========================================================
    async cancelOrder(req: AuthRequest, res: Response) {
        const customerId = this.getCustomerId(req);
        const orderId = parseInt(req.params.id);
        const data = req.body as CustomerCancelOrderInput;

        if (isNaN(orderId)) {
            return res.status(400).json({ success: false, message: 'Order ID invalid' });
        }

        // Service trả về { message: string }
        const result = await invoiceService.customerCancelOrder(orderId, customerId, data);

        return res.status(200).json({
            success: true,
            message: result.message,
            timestamp: new Date().toISOString(),
        });
    }
}

export default new CustomerInvoiceController();