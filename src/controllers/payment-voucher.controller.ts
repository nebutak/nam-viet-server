import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import paymentVoucherService from '@services/payment-voucher.service';

class PaymentVoucherController {
  // GET /api/payment-vouchers - Get all payment vouchers
  async getAll(req: AuthRequest, res: Response) {
    const result = await paymentVoucherService.getAll(req.query as any);

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      statistics: result.statistics,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-vouchers/:id - Get payment voucher by ID
  async getById(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const voucher = await paymentVoucherService.getById(id);

    res.status(200).json({
      success: true,
      data: voucher,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-vouchers/my-payment-vouchers - Get current user vouchers
  async getMyPayments(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const result = await paymentVoucherService.getMyPayments(userId, req.query as any);

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      statistics: result.statistics,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-vouchers/supplier/:supplierId - Get vouchers by supplier
  async getBySupplier(req: AuthRequest, res: Response) {
    const supplierId = parseInt(req.params.supplierId);
    const vouchers = await paymentVoucherService.getBySupplier(supplierId);

    res.status(200).json({
      success: true,
      data: vouchers,
      meta: {
        total: vouchers.length,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-vouchers/statistics - Get statistics
  async getStatistics(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const statistics = await paymentVoucherService.getStatistics(
      fromDate as string,
      toDate as string
    );

    res.status(200).json({
      success: true,
      data: statistics,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-vouchers/summary - Get summary statistics
  async getSummary(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const summary = await paymentVoucherService.getSummary(fromDate as string, toDate as string);

    res.status(200).json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-vouchers/report/expense - Get expense report
  async getExpenseReport(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;

    if (!fromDate || !toDate) {
      res.status(400).json({
        success: false,
        message: 'fromDate và toDate là các trường bắt buộc.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const report = await paymentVoucherService.getExpenseReport(
      fromDate as string,
      toDate as string
    );

    res.status(200).json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/payment-vouchers - Create new payment voucher
  async create(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const voucher = await paymentVoucherService.create(req.body, userId);

    res.status(201).json({
      success: true,
      data: voucher,
      message: 'Phiếu thanh toán đã được tạo thành công.',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/payment-vouchers/:id - Update payment voucher
  async update(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const voucher = await paymentVoucherService.update(id, req.body, userId);

    res.status(200).json({
      success: true,
      data: voucher,
      message: 'Phiếu thanh toán đã được cập nhật thành công.',
      timestamp: new Date().toISOString(),
    });
  }



  // POST /api/payment-vouchers/:id/post - Post voucher to accounting
  async post(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const voucher = await paymentVoucherService.post(id, userId, req.body);

    res.status(200).json({
      success: true,
      data: voucher,
      message: 'Chứng từ thanh toán đã được ghi nhận vào hệ thống kế toán thành công.',
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/payment-vouchers/:id/cancel - Cancel voucher
  async cancel(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await paymentVoucherService.cancel(id, userId, req.body);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Hủy phiếu chi thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // DELETE /api/payment-vouchers/:id - Delete payment voucher
  async delete(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await paymentVoucherService.delete(id, userId);

    res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/payment-vouchers/bulk-post - Bulk post vouchers
  async bulkPost(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_IDS',
          message: 'ids phải là mảng không rỗng',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await paymentVoucherService.bulkPost(ids, userId);

    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

}

export default new PaymentVoucherController();
