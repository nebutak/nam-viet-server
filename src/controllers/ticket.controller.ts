import { Request, Response, NextFunction } from 'express';
import ticketService from '../services/ticket.service';
import { createTicketSchema, updateTicketSchema, queryTicketsSchema } from '../validators/ticket.validator';
import { AuthRequest } from '@custom-types/common.type';

class TicketController {
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = createTicketSchema.parse(req.body);
      const ticket = await ticketService.create(req.user!.id, data);
      res.status(201).json({
        success: true,
        message: 'Tạo phiếu hỗ trợ thành công',
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const query = queryTicketsSchema.parse(req.query);
      const result = await ticketService.findAll(query);
      res.status(200).json({
        success: true,
        data: result.tickets,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async findOne(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const ticket = await ticketService.findOne(id);
      res.status(200).json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const data = updateTicketSchema.parse(req.body);
      const ticket = await ticketService.update(id, data);
      res.status(200).json({
        success: true,
        message: 'Cập nhật phiếu hỗ trợ thành công',
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      await ticketService.delete(id);
      res.status(200).json({
        success: true,
        message: 'Xóa phiếu hỗ trợ thành công',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TicketController();
