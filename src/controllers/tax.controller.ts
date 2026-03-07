import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import taxService from '@services/tax.service';

class TaxController {
    async getAll(req: AuthRequest, res: Response) {
        const result = await taxService.getAll(req.query as any);
        res.status(200).json({ success: true, data: result.data, meta: result.meta });
    }

    async getById(req: AuthRequest, res: Response) {
        const tax = await taxService.getById(parseInt(req.params.id));
        res.status(200).json({ success: true, data: tax });
    }

    async create(req: AuthRequest, res: Response) {
        const tax = await taxService.create(req.body, req.user!.id);
        res.status(201).json({ success: true, data: tax, message: 'Thêm thuế thành công' });
    }

    async update(req: AuthRequest, res: Response) {
        const tax = await taxService.update(parseInt(req.params.id), req.body, req.user!.id);
        res.status(200).json({ success: true, data: tax, message: 'Cập nhật thuế thành công' });
    }

    async delete(req: AuthRequest, res: Response) {
        const result = await taxService.delete(parseInt(req.params.id), req.user!.id);
        res.status(200).json({ success: true, message: result.message });
    }

    async bulkDelete(req: AuthRequest, res: Response) {
        const result = await taxService.bulkDelete(req.body.ids, req.user!.id);
        res.status(200).json({ success: true, message: result.message });
    }
}

export default new TaxController();
