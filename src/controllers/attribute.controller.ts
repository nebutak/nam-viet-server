import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import attributeService from '@services/attribute.service';

class AttributeController {
    async getAll(req: AuthRequest, res: Response) {
        const result = await attributeService.getAll(req.query as any);
        res.status(200).json({ success: true, data: result.data, meta: result.meta });
    }

    async getById(req: AuthRequest, res: Response) {
        const attribute = await attributeService.getById(parseInt(req.params.id));
        res.status(200).json({ success: true, data: attribute });
    }

    async create(req: AuthRequest, res: Response) {
        const attribute = await attributeService.create(req.body, req.user!.id);
        res.status(201).json({ success: true, data: attribute, message: 'Thêm thuộc tính thành công' });
    }

    async update(req: AuthRequest, res: Response) {
        const attribute = await attributeService.update(parseInt(req.params.id), req.body, req.user!.id);
        res.status(200).json({ success: true, data: attribute, message: 'Cập nhật thuộc tính thành công' });
    }

    async delete(req: AuthRequest, res: Response) {
        const result = await attributeService.delete(parseInt(req.params.id), req.user!.id);
        res.status(200).json({ success: true, message: result.message });
    }

    async bulkDelete(req: AuthRequest, res: Response) {
        const result = await attributeService.bulkDelete(req.body.ids, req.user!.id);
        res.status(200).json({ success: true, message: result.message });
    }

    async import(req: AuthRequest, res: Response) {
        const userId = req.user!.id;
        const items = req.body.items;

        if (!items || !Array.isArray(items)) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Dữ liệu không hợp lệ',
                },
            });
            return;
        }

        const result = await attributeService.importAttributes(items, userId);

        res.status(200).json({
            success: true,
            data: result,
            message: 'Import dữ liệu thành công',
            timestamp: new Date().toISOString(),
        });
    }

    async downloadTemplate(_req: AuthRequest, res: Response) {
        const buffer = await attributeService.downloadImportTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Template_Import_Thuoctinh.xlsx');
        res.send(buffer);
    }
}

export default new AttributeController();
