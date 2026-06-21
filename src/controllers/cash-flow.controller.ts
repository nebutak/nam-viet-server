import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import cashFlowService from '@services/cash-flow.service';

class CashFlowController {
  // GET /api/cash-flow
  async getCashFlowReport(req: AuthRequest, res: Response) {
    try {
      const result = await cashFlowService.getLedger(req.query);

      res.status(200).json({
        success: true,
        data: result.data,
        summary: result.summary,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Lỗi khi lấy báo cáo thu chi:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy báo cáo thu chi',
        error: error.message,
      });
    }
  }
}

export default new CashFlowController();
