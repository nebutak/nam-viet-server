import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import unitService from '@services/unit.service';

class UnitController {
    async getAll(req: AuthRequest, res: Response) {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const params = {
            ...req.query,
            page: page.toString(),
            limit: limit.toString(),
        };

        const result = await unitService.getAll(params as any);

        res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.meta,
            timestamp: new Date().toISOString(),
        });
    }

    async getById(req: AuthRequest, res: Response) {
        const id = parseInt(req.params.id);
        const unit = await unitService.getById(id);

        res.status(200).json({
            success: true,
            data: unit,
            timestamp: new Date().toISOString(),
        });
    }

    async create(req: AuthRequest, res: Response) {
        const userId = req.user!.id;
        const unit = await unitService.create(req.body, userId);

        res.status(201).json({
            success: true,
            data: unit,
            message: 'Unit created successfully',
            timestamp: new Date().toISOString(),
        });
    }

    async update(req: AuthRequest, res: Response) {
        const id = parseInt(req.params.id);
        const userId = req.user!.id;
        const unit = await unitService.update(id, req.body, userId);

        res.status(200).json({
            success: true,
            data: unit,
            message: 'Unit updated successfully',
            timestamp: new Date().toISOString(),
        });
    }

    async updateStatus(req: AuthRequest, res: Response) {
        const id = parseInt(req.params.id);
        const userId = req.user!.id;
        const unit = await unitService.updateStatus(id, req.body, userId);

        res.status(200).json({
            success: true,
            data: unit,
            message: 'Unit status updated successfully',
            timestamp: new Date().toISOString(),
        });
    }

    async delete(req: AuthRequest, res: Response) {
        const id = parseInt(req.params.id);
        const userId = req.user!.id;
        const result = await unitService.delete(id, userId);

        res.status(200).json({
            success: true,
            message: result.message,
            timestamp: new Date().toISOString(),
        });
    }

    async bulkDelete(req: AuthRequest, res: Response) {
        const userId = req.user!.id;
        const result = await unitService.bulkDelete(req.body.ids, userId);

        res.status(200).json({
            success: true,
            message: result.message,
            timestamp: new Date().toISOString(),
        });
    }
}

export default new UnitController();
