import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import purchaseOrderService from '@services/purchase-order.service';
import { ApiResponse } from '@custom-types/common.type';

class PurchaseOrderController {
  // GET /api/purchase-orders
  async getAll(req: AuthRequest, res: Response) {
    const result = await purchaseOrderService.getAll(req.query as any);

    const response: ApiResponse = {
      success: true,
      data: result.data,
      meta: result.meta,
      message: result.message,
      cards: result.cards,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/purchase-orders/by-user
  async getByUser(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const result = await purchaseOrderService.getByUser(req.query as any, userId);

    const response: ApiResponse = {
      success: true,
      data: result.data,
      meta: result.meta,
      message: result.message,
      cards: result.cards,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/purchase-orders/:id
  async getById(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const purchaseOrder = await purchaseOrderService.getById(parseInt(id));

    const response: ApiResponse = {
      success: true,
      data: purchaseOrder,
      message: 'Success',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/purchase-orders
  async create(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const data = req.body;

    const purchaseOrder = await purchaseOrderService.create(data, userId);

    const response: ApiResponse = {
      success: true,
      data: purchaseOrder,
      message: 'Đơn đặt hàng được tạo thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // PUT /api/purchase-orders/:id
  async update(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const data = req.body;

    const purchaseOrder = await purchaseOrderService.update(parseInt(id), data, userId);

    const response: ApiResponse = {
      success: true,
      data: purchaseOrder,
      message: 'Đơn đặt hàng được cập nhật thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // PUT /api/purchase-orders/:id/approve
  async approve(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const { notes } = req.body;

    const purchaseOrder = await purchaseOrderService.approve(parseInt(id), userId, notes);

    const response: ApiResponse = {
      success: true,
      data: purchaseOrder,
      message: 'Đơn đặt hàng đã được phê duyệt thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  async sendEmail(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    const purchaseOrder = await purchaseOrderService.sendEmail(parseInt(id), userId);

    const response: ApiResponse = {
      success: true,
      data: purchaseOrder,
      message: 'Email đơn đặt hàng được gửi đi',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // PUT /api/purchase-orders/:id/receive
  async receive(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const data = req.body;

    const result = await purchaseOrderService.receive(parseInt(id), userId, data);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Đơn đặt hàng đã được tiếp nhận thành công. Giao dịch nhập khẩu đã được tạo.',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // PUT /api/purchase-orders/:id/cancel
  async cancel(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const { reason } = req.body;

    const purchaseOrder = await purchaseOrderService.cancel(parseInt(id), userId, reason);

    const response: ApiResponse = {
      success: true,
      data: purchaseOrder,
      message: 'Đơn đặt hàng đã được hủy thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // DELETE /api/purchase-orders/:id
  async delete(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const result = await purchaseOrderService.delete(parseInt(id), userId);

    res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/purchase-orders/:id/revert
  async revert(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    const purchaseOrder = await purchaseOrderService.revert(parseInt(id), userId);

    const response: ApiResponse = {
      success: true,
      data: purchaseOrder,
      message: 'Đơn đặt hàng đã được revert về trạng thái chờ duyệt',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }
}

export default new PurchaseOrderController();
