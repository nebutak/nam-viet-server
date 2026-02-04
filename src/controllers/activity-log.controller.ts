import { Response } from 'express';
import { AuthRequest, ApiResponse } from '@custom-types/common.type';
import activityLogService, { QueryActivityLogsInput } from '@services/activity-log.service';

class ActivityLogController {
  // GET /api/activity-logs
  async getAllActivityLogs(req: AuthRequest, res: Response) {
    const query = req.query as unknown as QueryActivityLogsInput;

    const result = await activityLogService.getAllActivityLogs(query);

    const response: ApiResponse = {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy nhật ký hoạt động thành công!',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }
}

export default new ActivityLogController();
