import { Response } from 'express';
import { ApiResponse, AuthRequest } from '@custom-types/common.type';
import salaryService from '@services/salary.service';
import {
  CalculateSalaryInput,
  CalculateBatchSalaryInput,
  UpdateSalaryInput,
  PaySalaryInput,
} from '@validators/salary.validator';

class SalaryController {
  // GET /api/salary - Get all salary records
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    const result = await salaryService.getAll(req.query as any);

    const response: ApiResponse = {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy danh sách bảng lương thành công!',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/salary/:id - Get salary by ID
  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const salary = await salaryService.getById(id);

      res.json({
        success: true,
        data: salary,
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

  // GET /api/salary/:userId/:month - Get salary by user and month
  async getByUserAndMonth(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);
      const month = req.params.month;

      const salary = await salaryService.getByUserAndMonth(userId, month);

      res.json({
        success: true,
        data: salary,
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

  // POST /api/salary/calculate - Calculate salary for a user in a month
  async calculate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const data = req.body as CalculateSalaryInput;
      const creatorId = req.user!.id;

      const result = await salaryService.calculate(data, creatorId);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Salary calculated successfully',
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

  // POST /api/salary/calculate-batch - Calculate batch salaries
  async calculateBatch(req: AuthRequest, res: Response): Promise<void> {
    try {
      const data = req.body as CalculateBatchSalaryInput;
      const creatorId = req.user!.id;

      const result = await salaryService.calculateBatch(data, creatorId);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Batch salaries calculated successfully',
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

  // POST /api/salary/:id/recalculate - Recalculate existing salary
  async recalculate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const adminId = req.user!.id;

      const result = await salaryService.recalculate(id, adminId);

      res.json({
        success: true,
        data: result,
        message: 'Salary recalculated successfully',
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

  // PUT /api/salary/:id - Update salary
  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const data = req.body as UpdateSalaryInput;
      const adminId = req.user!.id;

      const salary = await salaryService.update(id, data, adminId);

      res.json({
        success: true,
        data: salary,
        message: 'Salary updated successfully',
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

  // PUT /api/salary/:id/approve - Approve salary
  async approve(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { notes } = req.body;
      const approverId = req.user!.id;

      const salary = await salaryService.approve(id, approverId, notes);

      res.json({
        success: true,
        data: salary,
        message: 'Salary approved successfully',
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

  // POST /api/salary/:id/pay - Pay salary (create payment voucher)
  async pay(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const data = req.body as PaySalaryInput;
      const payerId = req.user!.id;

      const result = await salaryService.pay(id, data, payerId);

      res.json({
        success: true,
        data: result,
        message: 'Salary paid successfully',
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

  // DELETE /api/salary/:id - Delete salary
  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const adminId = req.user!.id;

      const result = await salaryService.delete(id, adminId);

      res.json({
        success: true,
        data: result,
        message: 'Salary deleted successfully',
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

  // GET /api/salary/summary - Get salary summary
  async getSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { fromMonth, toMonth } = req.query;

      if (!fromMonth || !toMonth) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'fromMonth and toMonth are required',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const summary = await salaryService.getSummary(fromMonth as string, toMonth as string);

      res.json({
        success: true,
        data: summary,
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

export default new SalaryController();
