import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import attendanceService from '@services/attendance.service';
import {
  AttendanceQueryInput,
  CheckInInput,
  CheckOutInput,
  UpdateAttendanceInput,
  RequestLeaveInput,
} from '@validators/attendance.validator';

class AttendanceController {
  // GET /api/attendance - Get all attendance records
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const query = req.query as unknown as AttendanceQueryInput;
      const result = await attendanceService.getAll(query);

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

  // GET /api/attendance/:id - Get attendance by ID
  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const attendance = await attendanceService.getById(id);

      res.json({
        success: true,
        data: attendance,
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

  // GET /api/attendance/my - Get my attendance records
  async getMyAttendance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as AttendanceQueryInput;
      const result = await attendanceService.getMyAttendance(userId, query);

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

  // POST /api/attendance/check-in - Check in
  async checkIn(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const data = req.body as CheckInInput;

      const attendance = await attendanceService.checkIn(userId, data);

      res.status(201).json({
        success: true,
        data: attendance,
        message: 'Checked in thành công',
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

  // POST /api/attendance/check-out - Check out
  async checkOut(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const data = req.body as CheckOutInput;

      const result = await attendanceService.checkOut(userId, data);

      res.json({
        success: true,
        data: result,
        message: 'Checked out thành công',
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

  // PUT /api/attendance/:id - Update attendance (Admin)
  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const data = req.body as UpdateAttendanceInput;
      const adminId = req.user!.id;

      const attendance = await attendanceService.update(id, data, adminId);

      res.json({
        success: true,
        data: attendance,
        message: 'Đã cập nhật điểm danh thành công',
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

  // POST /api/attendance/leave - Request leave
  async requestLeave(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const data = req.body as RequestLeaveInput;

      const attendance = await attendanceService.requestLeave(userId, data);

      res.status(201).json({
        success: true,
        data: attendance,
        message: 'Yêu cầu xin nghỉ phép được gửi thành công',
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

  // PUT /api/attendance/:id/approve - Approve/Reject leave
  async approveLeave(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { approved, notes } = req.body;
      const approverId = req.user!.id;

      const attendance = await attendanceService.approveLeave(id, approved, approverId, notes);

      res.json({
        success: true,
        data: attendance,
        message: approved ? 'Duyệt yêu cầu nghỉ phép thành công' : 'Huỷ yêu cầu nghỉ phép',
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

  // GET /api/attendance/report - Monthly report
  async getMonthlyReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month, userId } = req.query;
      const report = await attendanceService.getMonthlyReport(
        month as string,
        userId ? parseInt(userId as string) : undefined
      );

      res.json({
        success: true,
        data: report,
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

  // GET /api/attendance/statistics - Get user statistics
  async getUserStatistics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { userId, fromDate, toDate, month } = req.query;

      let startDate: Date;
      let endDate: Date;

      if (month) {
        // Convert YYYYMM format to date range
        const monthStr = month as string;
        const year = parseInt(monthStr.substring(0, 4));
        const monthNum = parseInt(monthStr.substring(4, 6));
        startDate = new Date(year, monthNum - 1, 1);
        endDate = new Date(year, monthNum, 0);
      } else if (fromDate && toDate) {
        startDate = new Date(fromDate as string);
        endDate = new Date(toDate as string);
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Bạn cần chọn tháng hoặc (từ ngày và đến ngày).',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const stats = await attendanceService.getUserStatistics(
        userId ? parseInt(userId as string) : req.user!.id,
        startDate,
        endDate
      );

      const isLocked = month ? await attendanceService.isMonthLocked(month as string) : false;

      res.json({
        success: true,
        data: {
          ...stats,
          isMonthLocked: isLocked
        },
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

  // POST /api/attendance/lock-month - Lock attendance month
  async lockMonth(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month } = req.body as { month: string };
      const userId = req.user!.id;

      const result = await attendanceService.lockMonth(month, userId);

      res.json({
        success: true,
        data: result,
        message: `Khóa công tháng ${month} thành công.`,
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

  // POST /api/attendance/unlock-month - Unlock attendance month
  async unlockMonth(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month } = req.body as { month: string };

      const result = await attendanceService.unlockMonth(month);

      res.json({
        success: true,
        data: result,
        message: `Mở khóa công tháng ${month} thành công.`,
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

  // POST /api/attendance/import - Import attendance from file
  async importFromFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'No file provided',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const result = await attendanceService.importFromFile(req.file.path, req.user!.id);

      res.json({
        success: true,
        data: result,
        message: `Imported ${result.summary.validCount} attendance records`,
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

  // DELETE /api/attendance/:id - Delete attendance
  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const adminId = req.user!.id;

      const result = await attendanceService.delete(id, adminId);

      res.json({
        success: true,
        data: result,
        message: 'Đã xóa chấm công thành công',
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

export default new AttendanceController();
