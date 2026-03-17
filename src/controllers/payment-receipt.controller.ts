import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import paymentReceiptService from '@services/payment-receipt.service';

class PaymentReceiptController {
  // GET /api/payment-receipts - Get all payment receipts
  async getAll(req: AuthRequest, res: Response) {
    const result = await paymentReceiptService.getAll(req.query as any);

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      statistics: result.statistics,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-receipts/:id - Get payment receipt by ID
  async getById(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const receipt = await paymentReceiptService.getById(id);

    res.status(200).json({
      success: true,
      data: receipt,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-receipts/my-receipts - Get current user receipts
  async getMyReceipts(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const result = await paymentReceiptService.getMyReceipts(userId, req.query as any);

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      statistics: result.statistics,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-receipts/customer/:customerId - Get receipts by customer
  async getByCustomer(req: AuthRequest, res: Response) {
    const customerId = parseInt(req.params.customerId);
    const receipts = await paymentReceiptService.getByCustomer(customerId);

    res.status(200).json({
      success: true,
      data: receipts,
      meta: {
        total: receipts.length,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-receipts/summary - Get summary statistics
  async getSummary(req: AuthRequest, res: Response) {
    const { fromDate, toDate } = req.query;
    const summary = await paymentReceiptService.getSummary(fromDate as string, toDate as string);

    res.status(200).json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/payment-receipts - Create new payment receipt
  async create(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const receipt = await paymentReceiptService.create(req.body, userId);

    res.status(201).json({
      success: true,
      data: receipt,
      message: 'Payment receipt created successfully',
      timestamp: new Date().toISOString(),
    });
  }

  // PUT /api/payment-receipts/:id - Update payment receipt
  async update(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const receipt = await paymentReceiptService.update(id, req.body, userId);

    res.status(200).json({
      success: true,
      data: receipt,
      message: 'Payment receipt updated successfully',
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/payment-receipts/:id/post - Post receipt to accounting
  async post(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const receipt = await paymentReceiptService.post(id, userId, req.body);

    res.status(200).json({
      success: true,
      data: receipt,
      message: 'Payment receipt posted to accounting successfully',
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/payment-receipts/:id/unpost - Unpost receipt
  async unpost(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const receipt = await paymentReceiptService.unpost(id, userId);

    res.status(200).json({
      success: true,
      data: receipt,
      message: 'Payment receipt unposted successfully',
      timestamp: new Date().toISOString(),
    });
  }

  // DELETE /api/payment-receipts/:id - Delete payment receipt
  async delete(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await paymentReceiptService.delete(id, userId);

    res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/payment-receipts/:id/send-email - Send email receipt
  async sendEmail(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const receipt = await paymentReceiptService.sendEmail(id, userId);

    res.status(200).json({
      success: true,
      data: receipt,
      message: 'Gửi biên lai điện tử thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/payment-receipts/:id/qr-code - Get VietQR code link
  async getQRCode(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const result = await paymentReceiptService.getQRCode(id);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }
}

export default new PaymentReceiptController();
