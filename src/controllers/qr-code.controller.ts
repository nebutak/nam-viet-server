import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import qrCodeService from '@services/qr-code.service';

class QRCodeController {
  /**
   * POST /api/attendance/qr/generate
   * Generate QR code for attendance
   */
  async generate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { startDate, endDate, shift, type, clientUrl } = req.body;
      const originUrl = req.get('origin') || clientUrl || 'http://localhost:5173';
      const userId = req.user!.id;
      
      const result = await qrCodeService.generateQRCode(
        new Date(startDate),
        new Date(endDate),
        userId,
        shift,
        type,
        originUrl
      );
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Tạo QR code thành công',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
  
  /**
   * POST /api/attendance/qr/scan
   * Scan QR code and perform check-in
   */
  async scan(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { qrData, location } = req.body;
      const userId = req.user!.id;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      
      const result = await qrCodeService.scanQRCode(
        qrData,
        userId,
        location,
        ipAddress,
        userAgent
      );
      
      res.status(200).json({
        success: true,
        data: result,
        message: result.message
      });
    } catch (error: any) {
      console.error('===== SCAN ERROR =====');
      console.error(error);
      
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Lỗi xử lý QR Code';
      
      res.status(statusCode).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_SERVER_ERROR',
          message: message,
        },
        message: message // So frontend toast can access error.response.data.message easily
      });
    }
  }
  
  /**
   * GET /api/attendance/qr
   * Get all QR codes with pagination
   */
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20' } = req.query;
      const result = await qrCodeService.getAll(
        parseInt(page as string),
        parseInt(limit as string)
      );
      
      res.json({
        success: true,
        data: result.data,
        meta: result.meta,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
  
  /**
   * GET /api/attendance/qr/:id
   * Get QR code by ID
   */
  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const result = await qrCodeService.getById(id);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
  
  /**
   * PUT /api/attendance/qr/:id/deactivate
   * Deactivate QR code
   */
  async deactivate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const result = await qrCodeService.deactivate(id, userId);
      
      res.json({
        success: true,
        data: result,
        message: 'Đã vô hiệu hóa QR code',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
  
  /**
   * DELETE /api/attendance/qr/:id
   * Delete QR code (soft delete)
   */
  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const result = await qrCodeService.delete(id, userId);
      
      res.json({
        success: true,
        data: result,
        message: 'Đã xóa QR code thành công',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}

export default new QRCodeController();
