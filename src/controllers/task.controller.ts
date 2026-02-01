import { Request, Response, NextFunction } from 'express';
import taskService from '../services/task.service';
import { createTaskSchema, updateTaskSchema, queryTasksSchema } from '../validators/task.validator';
import { AuthRequest } from '@custom-types/common.type';

class TaskController {
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = createTaskSchema.parse(req.body);
      const task = await taskService.create(req.user!.id, data);
      res.status(201).json({
        success: true,
        message: 'Tạo nhiệm vụ thành công',
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const query = queryTasksSchema.parse(req.query);
      const result = await taskService.findAll(query);
      res.status(200).json({
        success: true,
        data: result.tasks,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async findOne(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const task = await taskService.findOne(id);
      res.status(200).json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const data = updateTaskSchema.parse(req.body);
      const task = await taskService.update(id, data);
      res.status(200).json({
        success: true,
        message: 'Cập nhật nhiệm vụ thành công',
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      await taskService.delete(id);
      res.status(200).json({
        success: true,
        message: 'Xóa nhiệm vụ thành công',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TaskController();
