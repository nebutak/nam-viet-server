import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import invoiceService from '@services/invoice.service';

class InvoiceController {
  // GET /api/invoices - Get all sales orders
  async getAll(req: AuthRequest, res: Response) {
    const result = await invoiceService.getAll(req.query as any);
    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/invoices/by-user - Get all sales orders created by this user
  async getAllByUser(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const result = await invoiceService.getAllByUser(req.query as any, userId);
    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/invoices/:id - Get sales order by ID
  async getById(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const order = await invoiceService.getById(id);
    res.status(200).json({
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/invoices/:id/by-user - Get detail only if created by this user
  async getByIdForUser(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const order = await invoiceService.getByIdForUser(id, userId);
    res.status(200).json({
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/invoices - Create new sales order
  async create(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const result = await invoiceService.create(req.body, userId);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Tạo đơn hàng bán thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/invoices/:id - Update sales order
  async update(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const order = await invoiceService.update(id, req.body, userId);

    res.status(200).json({
      success: true,
      data: order,
      message: 'Cập nhật đơn hàng bán thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/invoices/:id/approve - Approve order
  async approve(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const order = await invoiceService.approve(id, userId, req.body);

    res.status(200).json({
      success: true,
      data: order,
      message: 'Phê duyệt đơn hàng bán thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/invoices/:id/complete - Complete order
  async complete(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const order = await invoiceService.complete(id, userId);

    res.status(200).json({
      success: true,
      data: order,
      message:
        'Hoàn thành đơn hàng bán thành công. Tồn kho đã được cập nhật và công nợ khách hàng đã được ghi nhận.',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/invoices/:id/cancel - Cancel order
  async cancel(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const order = await invoiceService.cancel(id, userId, req.body);

    res.status(200).json({
      success: true,
      data: order,
      message: 'Hủy đơn hàng bán thành công. Tồn kho đã được giải phóng.',
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/invoices/:id/payment - Process payment
  async processPayment(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const order = await invoiceService.processPayment(id, userId, req.body);

    res.status(200).json({
      success: true,
      data: order,
      message: 'Xử lý thanh toán thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // DELETE /api/invoices/:id - Delete order
  async delete(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await invoiceService.delete(id, userId);

    res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/invoices/bulk-delete - Delete multiple orders
  async bulkDelete(req: AuthRequest, res: Response) {
    const { ids } = req.body;
    const userId = req.user!.id;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: "ids" must be a non-empty array of numbers',
      });
    }

    const result = await invoiceService.bulkDelete(ids, userId);

    return res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/invoices/:id/revert - Revert order to pending
  async revert(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const order = await invoiceService.revert(id, userId);

    res.status(200).json({
      success: true,
      data: order,
      message: 'Chuyển trạng thái đơn hàng về chờ xác nhận thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/invoices/:id/recheck-status - Re-evaluate order completion status
  async recheckStatus(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await invoiceService.recheckStatus(id, userId);

    res.status(200).json({
      success: true,
      data: result,
      message: result.changed
        ? 'Trạng thái đơn hàng đã được cập nhật tự động'
        : 'Trạng thái đơn hàng không thay đổi',
      timestamp: new Date().toISOString(),
    });
  }

}

export default new InvoiceController();
