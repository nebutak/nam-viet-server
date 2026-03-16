import { Response } from 'express';
import overtimeService from '@services/overtime.service';
import { AuthRequest, ApiResponse } from '@custom-types/common.type';

class OvertimeController {
  // Create Session
  createSession = async (req: AuthRequest, res: Response) => {
    try {
      // TODO: Validate CreateOvertimeSessionInput properly
      const session = await overtimeService.createSession(req.user!.id, req.body);
      
      const response: ApiResponse = {
        success: true,
        data: session,
        message: 'Tạo phiên tăng ca thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(201).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server',
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Update Session
  updateSession = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const session = await overtimeService.updateSession(req.user!.id, Number(id), req.body);
      
      const response: ApiResponse = {
        success: true,
        data: session,
        message: 'Cập nhật phiên tăng ca thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server',
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Delete Session
  deleteSession = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await overtimeService.deleteSession(req.user!.id, Number(id));
      
      const response: ApiResponse = {
        success: true,
        message: 'Xóa phiên tăng ca thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server',
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Add Employees
  addEmployees = async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { userIds } = req.body;
      const result = await overtimeService.addEmployees(req.user!.id, Number(sessionId), userIds);
      
      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Thêm nhân viên thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Remove Employee
  removeEmployee = async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId, userId } = req.params;
      const result = await overtimeService.removeEmployee(req.user!.id, Number(sessionId), Number(userId));
      
      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Xóa nhân viên khỏi phiên thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Close Session
  closeSession = async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { endTime } = req.body;
      const result = await overtimeService.closeSession(req.user!.id, Number(sessionId), endTime);
      
      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Đóng phiên tăng ca thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Get All Sessions
  getAll = async (req: AuthRequest, res: Response) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await overtimeService.getSessions(page, limit);
      
      const response: ApiResponse = {
        success: true,
        data: result.data,
        meta: result.meta,
        message: 'Lấy danh sách thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Get Session Detail
  getById = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await overtimeService.getSessionById(Number(id));
      
      if (!result) {
         res.status(404).json({
            success: false,
            message: "Không tìm thấy phiên",
            timestamp: new Date().toISOString(),
         });
         return;
      }

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Lấy thông tin thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };
  // Get Overtime Stats
  getStats = async (_req: AuthRequest, res: Response) => {
    try {
      const result = await overtimeService.getStats();
      
      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Lấy thống kê thành công',
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export default new OvertimeController();
