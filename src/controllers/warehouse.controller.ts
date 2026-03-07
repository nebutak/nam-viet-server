import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import warehouseService from '@services/warehouse.service';
import { ApiResponse } from '@custom-types/common.type';

class WarehouseController {
  // GET /api/warehouses
  async getAllWarehouses(req: AuthRequest, res: Response) {
    const result = await warehouseService.getAllWarehouses(req.query as any);

    const response: ApiResponse = {
      success: true,
      message: result.message,
      cards: result.cards,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/warehouses/:id
  async getWarehouseById(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const warehouse = await warehouseService.getWarehouseById(id);

    const response: ApiResponse = {
      success: true,
      data: warehouse,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/warehouses
  async createWarehouse(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const warehouse = await warehouseService.createWarehouse(req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: warehouse,
      message: 'Tạo kho thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // PUT /api/warehouses/:id
  async updateWarehouse(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const warehouse = await warehouseService.updateWarehouse(id, req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: warehouse,
      message: 'Kho cập nhật thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // DELETE /api/warehouses/:id
  async deleteWarehouse(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await warehouseService.deleteWarehouse(id, userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/warehouses/:id/statistics
  async getWarehouseStatistics(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const stats = await warehouseService.getWarehouseStatistics(id);

    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // PATCH /api/warehouses/:id/status
  async updateWarehouseStatus(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const { status } = req.body;

    const warehouse = await warehouseService.updateStatus(id, status, userId);

    const response: ApiResponse = {
      success: true,
      data: warehouse,
      message: 'Cập nhật trạng thái thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/warehouses/bulk-delete
  async bulkDelete(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const { ids } = req.body;

    const numIds = Array.isArray(ids) ? ids.map(id => Number(id)) : [];
    const result = await warehouseService.bulkDelete(numIds, userId);

    const response: ApiResponse = {
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/warehouses/import
  async importWarehouses(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const { items } = req.body;

    const result = await warehouseService.importWarehouses(items, userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Nhập dữ liệu kho thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/warehouses/import-template
  async getImportTemplate(_req: AuthRequest, res: Response) {
    const buffer = await warehouseService.getImportTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=warehouse_import_template.xlsx'
    );

    res.send(buffer);
  }
}

export default new WarehouseController();
