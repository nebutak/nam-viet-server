import { Response } from 'express';
import { AuthRequest, ApiResponse } from '@custom-types/common.type';
import loginHistoryService from '@services/login-history.service';

class LoginHistoryController {
  // GET /api/settings/login-history - Get user's login history
  async getLoginHistory(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const logs = await loginHistoryService.getLoginHistory(userId, limit);

    const response: ApiResponse = {
      success: true,
      data: logs,
      message: 'Lấy lịch sử đăng nhập thành công!',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/settings/login-history - Record login event
  async createLoginHistory(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const { userAgent, ipAddress } = req.body;

    const log = await loginHistoryService.createLoginHistory(userId, {
      userAgent,
      ipAddress,
    });

    const response: ApiResponse = {
      success: true,
      data: log,
      message: 'Ghi nhận đăng nhập thành công!',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // POST /api/settings/login-history/revoke - Revoke login sessions
  async revokeLoginSessions(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const { logs } = req.body;

    const result = await loginHistoryService.revokeLoginSessions(userId, logs);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: `Đã đăng xuất ${result.revokedCount} phiên!`,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/settings/login-history/stats - Get login statistics
  async getLoginStats(req: AuthRequest, res: Response) {
    const userId = req.user!.id;

    const stats = await loginHistoryService.getLoginStats(userId);

    const response: ApiResponse = {
      success: true,
      data: stats,
      message: 'Lấy thống kê đăng nhập thành công!',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }
}

export default new LoginHistoryController();
