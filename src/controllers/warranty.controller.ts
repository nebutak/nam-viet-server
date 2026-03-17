import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import warrantyService from '@services/warranty.service';
import { WarrantyQueryInput } from '@validators/warranty.validator';

class WarrantyController {
  // GET /api/warranty
  async getAll(req: AuthRequest, res: Response) {
    const result = await warrantyService.getAll(req.query as unknown as WarrantyQueryInput);
    res.status(200).json({
      success: true,
      data: result.warranties,
      meta: result.pagination,
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/warranty/:id
  async getById(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const warranty = await warrantyService.getById(id);
    res.status(200).json({
      success: true,
      data: warranty,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/warranty
  async create(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const warranty = await warrantyService.create(req.body, userId);
    res.status(201).json({
      success: true,
      data: warranty,
      message: 'Tạo phiếu bảo hành thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // PATCH /api/warranty/:id/status
  async updateStatus(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    const userId = req.user!.id;
    const result = await warrantyService.updateStatus(id, status, userId);
    res.status(200).json({
      success: true,
      data: result,
      message: 'Cập nhật trạng thái bảo hành thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // DELETE /api/warranty/:id
  async delete(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    await warrantyService.delete(id, userId);
    res.status(200).json({
      success: true,
      message: 'Xóa phiếu bảo hành thành công',
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/warranty/:id/reminder
  async sendReminder(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await warrantyService.sendReminderEmail(id, userId, req.body);
    res.status(200).json({
      success: true,
      data: result,
      message: result.success ? 'Đã gửi email nhắc bảo hành thành công' : 'Gửi email nhắc bảo hành thất bại',
      timestamp: new Date().toISOString(),
    });
  }
}

export default new WarrantyController();
