import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import ExpiryService from '@services/expiry.service';

class ExpiryController {
  private expiryService: ExpiryService;

  constructor() {
    this.expiryService = new ExpiryService();
  }

  async getAllAccountsWithExpiries(_req: AuthRequest, res: Response) {
    const data = await this.expiryService.getAllAccountsWithExpiries();
    return res.status(200).json({
      success: true,
      data,
      message: 'Danh sách tài khoản',
      timestamp: new Date().toISOString(),
    });
  }

  async getExpiryById(req: AuthRequest, res: Response) {
    const expiry = await this.expiryService.getExpiryById(Number(req.params.id));
    return res.status(200).json({
      success: true,
      data: expiry,
      message: 'Hạn dùng',
      timestamp: new Date().toISOString(),
    });
  }

  async createExpiry(req: AuthRequest, res: Response) {
    const expiry = await this.expiryService.createExpiry(req.body, req.user!.id);
    return res.status(201).json({
      success: true,
      data: expiry,
      message: 'Tạo hạn dùng thành công',
      timestamp: new Date().toISOString(),
    });
  }

  async updateExpiry(req: AuthRequest, res: Response) {
    const expiry = await this.expiryService.updateExpiry(Number(req.params.id), req.body, req.user!.id);
    return res.status(200).json({
      success: true,
      data: expiry,
      message: 'Cập nhật hạn dùng thành công',
      timestamp: new Date().toISOString(),
    });
  }

  async deleteExpiry(req: AuthRequest, res: Response) {
    await this.expiryService.deleteExpiry(Number(req.params.id));
    return res.status(200).json({
      success: true,
      data: null,
      message: 'Xóa hạn dùng thành công',
      timestamp: new Date().toISOString(),
    });
  }

  async getAccountsByCustomerId(req: AuthRequest, res: Response) {
    const expiries = await this.expiryService.getAccountsByCustomerId(
      Number(req.params.id),
      Number(req.query.page || 1),
      Number(req.query.limit || 30)
    );
    return res.status(200).json({
      success: true,
      data: expiries,
      message: 'Danh sách tài khoản của khách hàng',
      timestamp: new Date().toISOString(),
    });
  }

  async deleteAccount(req: AuthRequest, res: Response) {
    await this.expiryService.deleteAccount(Number(req.params.id));
    return res.status(200).json({
      success: true,
      data: null,
      message: 'Xóa tài khoản thành công',
      timestamp: new Date().toISOString(),
    });
  }
}


export default new ExpiryController();
