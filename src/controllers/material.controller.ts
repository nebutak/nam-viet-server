import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import materialService from '@services/material.service';
import { ApiResponse } from '@custom-types/common.type';

class MaterialController {
    // GET /api/materials
    async getAllMaterials(req: AuthRequest, res: Response) {
        const result = await materialService.getAllMaterials(req.query as any);

        const response: ApiResponse = {
            success: true,
            data: result.data,
            meta: result.meta,
            timestamp: new Date().toISOString(),
        };

        res.status(200).json(response);
    }

    // GET /api/materials/:id
    async getMaterialById(req: AuthRequest, res: Response) {
        const id = parseInt(req.params.id);
        const material = await materialService.getMaterialById(id);

        const response: ApiResponse = {
            success: true,
            data: material,
            message: 'Success',
            timestamp: new Date().toISOString(),
        };

        res.status(200).json(response);
    }

    // POST /api/materials
    async createMaterial(req: AuthRequest, res: Response) {
        const userId = req.user!.id;
        const material = await materialService.createMaterial(req.body, userId);

        const response: ApiResponse = {
            success: true,
            data: material,
            message: 'Material created successfully',
            timestamp: new Date().toISOString(),
        };

        res.status(201).json(response);
    }

    // PUT /api/materials/:id
    async updateMaterial(req: AuthRequest, res: Response) {
        const id = parseInt(req.params.id);
        const userId = req.user!.id;
        const material = await materialService.updateMaterial(id, req.body, userId);

        const response: ApiResponse = {
            success: true,
            data: material,
            message: 'Material updated successfully',
            timestamp: new Date().toISOString(),
        };

        res.status(200).json(response);
    }

    // DELETE /api/materials/:id
    async deleteMaterial(req: AuthRequest, res: Response) {
        const id = parseInt(req.params.id);
        const userId = req.user!.id;
        const result = await materialService.deleteMaterial(id, userId);

        const response: ApiResponse = {
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
        };

        res.status(200).json(response);
    }
}

export default new MaterialController();
