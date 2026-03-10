import { Response } from 'express';
import { AuthRequest } from '@custom-types/common.type';
import productService from '@services/product.service';
import { ApiResponse } from '@custom-types/common.type';
import { UpdateFeaturedInput } from '@validators/product.validator';

class ProductController {
  // GET /api/products
  async getAll(req: AuthRequest, res: Response) {
    const {
      page,
      limit,
      search,
      categoryId,
      warehouseId,
      supplierId,
      status,
      sortBy,
      sortOrder,
    } = req.query as any;

    const result = await productService.getAll({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search,
      categoryId: categoryId ? parseInt(categoryId) : undefined,
      supplierId: supplierId ? parseInt(supplierId) : undefined,
      warehouseId: warehouseId ? parseInt(warehouseId) : undefined,
      status,
      sortBy,
      sortOrder,
    });

    const response: ApiResponse = {
      success: true,
      data: result.products,
      meta: result.pagination,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/products/:id
  async getById(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const product = await productService.getById(parseInt(id));

    const response: ApiResponse = {
      success: true,
      data: product,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // POST /api/products
  async create(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const data = req.body;

    if (req.file) {
      data.image = `/uploads/products/${req.file.filename}`;
    }

    const product = await productService.create(data, userId);

    const response: ApiResponse = {
      success: true,
      data: product,
      message: 'Product created successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  }

  // PUT /api/products/:id
  async update(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const data = req.body;

    if (req.file) {
      data.image = `/uploads/products/${req.file.filename}`;
    }

    const product = await productService.update(parseInt(id), data, userId);

    const response: ApiResponse = {
      success: true,
      data: product,
      message: 'Product updated successfully',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  async updateBannerStatus(req: AuthRequest, res: Response) {
    const userId = req.user!.id; 
    const { action, productIds } = req.body as UpdateFeaturedInput;

    const result = await productService.updateBannerStatus(action, userId, productIds);

    // Tạo message phản hồi linh động cho dễ hiểu
    let message = '';
    switch (action) {
      case 'set_featured':
        message = `Đã thêm ${result.updatedCount} sản phẩm vào banner nổi bật`;
        break;
      case 'unset_featured':
        message = `Đã gỡ ${result.updatedCount} sản phẩm khỏi banner nổi bật`;
        break;
      case 'reset_all':
        message = `Đã reset toàn bộ banner (Tắt ${result.updatedCount} sản phẩm)`;
        break;
    }

    const response: ApiResponse = {
      success: true,
      data: result, // Trả về object { success, action, updatedCount, affectedIds }
      message: message,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // DELETE /api/products/:id
  async delete(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await productService.delete(parseInt(id), userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/products/low-stock
  async getLowStock(req: AuthRequest, res: Response) {
    const { warehouseId } = req.query;

    const products = await productService.getLowStock(
      warehouseId ? parseInt(warehouseId as string) : undefined
    );

    const response: ApiResponse = {
      success: true,
      data: products,
      meta: {
        total: products.length,
      },
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/products/expiring-soon
  async getExpiringSoon(req: AuthRequest, res: Response) {
    const { days } = req.query;

    const products = await productService.getExpiringSoon(days ? parseInt(days as string) : 7);

    const response: ApiResponse = {
      success: true,
      data: products,
      meta: {
        total: products.length,
      },
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // Image and video upload methods removed - use single image field in Product model

  // GET /api/products/stats/overview
  async getStats(_req: AuthRequest, res: Response) {
    const stats = await productService.getStats();

    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/products/stats/raw-materials
  async getRawMaterialStats(_req: AuthRequest, res: Response) {
    const stats = await productService.getRawMaterialStats();

    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/products/stats/packaging
  async getPackagingStats(_req: AuthRequest, res: Response) {
    const stats = await productService.getPackagingStats();

    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }

  // GET /api/products/stats/goods
  async getGoodsStats(_req: AuthRequest, res: Response) {
    const stats = await productService.getGoodsStats();

    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  }
}

export default new ProductController();
