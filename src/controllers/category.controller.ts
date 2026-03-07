import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import categoryService from '@services/category.service';
import { ApiResponse } from '@custom-types/common.type';

class CategoryController {
  // GET /api/categories
  async getAllCategories(req: AuthRequest, res: Response) {
    const result = await categoryService.getAllCategories(req.query as any);

    const response: ApiResponse = {
      success: true,
      message: result.message,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/categories/tree
  async getCategoryTree(_req: AuthRequest, res: Response) {
    const tree = await categoryService.getCategoryTree();

    const response: ApiResponse = {
      success: true,
      data: tree,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/categories/:id
  async getCategoryById(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const category = await categoryService.getCategoryById(id);

    const response: ApiResponse = {
      success: true,
      data: category,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/categories
  async createCategory(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const category = await categoryService.createCategory(req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: category,
      message: 'Tạo danh mục thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // PUT /api/categories/:id
  async updateCategory(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const category = await categoryService.updateCategory(id, req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: category,
      message: 'Cập nhật danh mục thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // DELETE /api/categories/:id
  async deleteCategory(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const result = await categoryService.deleteCategory(id, userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // PATCH /api/categories/:id/status
  async updateStatus(req: AuthRequest, res: Response) {
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const category = await categoryService.updateStatus(id, req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: category,
      message: 'Cập nhật trạng thái danh mục thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/categories/bulk-delete
  async bulkDelete(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const result = await categoryService.bulkDelete(req.body, userId);

    const response: ApiResponse = {
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/categories/stats/overview
  async getCategoryStats(_req: AuthRequest, res: Response) {
    const stats = await categoryService.getCategoryStats();

    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/categories/export
  async exportCategories(_req: AuthRequest, res: Response) {
    const buffer = await categoryService.exportCategories();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=categories.xlsx'
    );

    res.send(buffer);
  }

  // POST /api/categories/import
  async importCategories(req: AuthRequest, res: Response) {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng chọn file Excel để import',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userId = req.user!.id;
    const result = await categoryService.importCategories(req.file.buffer || require('fs').readFileSync(req.file.path), userId);

    // If using memoryStorage, req.file.buffer exists.
    // If using diskStorage, req.file.path exists and we must read it.

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Xử lý file Excel thành công',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }
}

export default new CategoryController();
