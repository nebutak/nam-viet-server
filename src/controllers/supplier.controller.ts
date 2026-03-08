import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import supplierService from '@services/supplier.service';
import { ApiResponse } from '@custom-types/common.type';

class SupplierController {
  // GET /api/suppliers
  async getAllSuppliers(req: AuthRequest, res: Response) {
    const result = await supplierService.getAllSuppliers(req.query as any);

    const response: ApiResponse = {
      success: true,
      data: result.data,
      meta: result.meta,
      cards: result.cards,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/suppliers/:id
  async getSupplierById(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const supplier = await supplierService.getSupplierById(id);

    const response: ApiResponse = {
      success: true,
      data: supplier,
      message: 'Success',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/suppliers/:id/products
  async getSupplierWithProducts(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const result = await supplierService.getSupplierWithProducts(id);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Success',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/suppliers
  async createSupplier(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const supplier = await supplierService.createSupplier(req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: supplier,
      message: 'Supplier created successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // PUT /api/suppliers/:id
  async updateSupplier(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const supplier = await supplierService.updateSupplier(id, req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: supplier,
      message: 'Supplier updated successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // PATCH /api/suppliers/:id/status
  async updateSupplierStatus(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const { status } = req.body;

    const supplier = await supplierService.updateSupplierStatus(id, status, userId);

    const response: ApiResponse = {
      success: true,
      data: supplier,
      message: 'Supplier status updated successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // DELETE /api/suppliers/:id - Delete supplier
  async delete(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await supplierService.deleteSupplier(id, userId);

    res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/suppliers/bulk-delete
  async bulkDelete(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Danh sách ID không hợp lệ'
        }
      });
      return;
    }

    const result = await supplierService.bulkDelete(ids, userId);

    res.status(200).json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  }

  // POST /api/suppliers/import
  async import(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const items = req.body.items;

    if (!items || !Array.isArray(items)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
        }
      });
      return;
    }

    try {
      const result = await supplierService.importSuppliers(items, userId);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Suppliers imported successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error.importErrors) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Import failed with validation errors',
            importErrors: error.importErrors,
            timestamp: new Date().toISOString(),
          }
        });
        return;
      }
      throw error;
    }
  }

  // GET /api/suppliers/import-template
  async downloadTemplate(req: AuthRequest, res: Response) {
    const { type } = req.query;
    try {
      const extension = type === 'excel' ? 'xlsx' : 'csv';
      const buffer = await supplierService.downloadImportTemplate(type as any);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=supplier_import_template.${extension}`
      );
      res.send(buffer);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: error.message
        }
      });
    }
  }
}

export default new SupplierController();
