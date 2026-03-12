import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import materialCategoryService from '@services/material-category.service';
import { ApiResponse } from '@custom-types/common.type';

class MaterialCategoryController {
    async getAllMaterialCategories(req: AuthRequest, res: Response) {
        const result = await materialCategoryService.getAllMaterialCategories(req.query as any);

        const response: ApiResponse = {
            success: true,
            data: result.data,
            meta: result.meta,
            timestamp: new Date().toISOString(),
        };

        res.status(200).json(response);
    }

    async createMaterialCategory(req: AuthRequest, res: Response) {
        const userId = req.user!.id;
        const category = await materialCategoryService.createMaterialCategory(req.body, userId);

        const response: ApiResponse = {
            success: true,
            data: category,
            message: 'Tạo danh mục nguyên liệu thành công',
            timestamp: new Date().toISOString(),
        };

        res.status(201).json(response);
    }
}

export default new MaterialCategoryController();
