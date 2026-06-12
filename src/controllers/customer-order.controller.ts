import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import customerOrderService from '@services/customer-order.service';

class CustomerOrderController {
  // POST /api/customer-portal/orders
  async createOrder(req: AuthRequest, res: Response) {
    const customerId = req.user!.id; // Attached by customerAuthentication middleware
    const order = await customerOrderService.createOrder(req.body, customerId);

    res.status(201).json({
      success: true,
      data: order,
      message: 'Đặt hàng thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/customer-portal/orders
  async getOrders(req: AuthRequest, res: Response) {
    const customerId = req.user!.id;
    const result = await customerOrderService.getOrders(customerId, req.query);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.meta,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/customer-portal/orders/:id
  async getOrderDetails(req: AuthRequest, res: Response) {
    const customerId = req.user!.id;
    const orderId = parseInt(req.params.id);
    const order = await customerOrderService.getOrderDetails(orderId, customerId);

    res.status(200).json({
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
    });
  }
}

export default new CustomerOrderController();
