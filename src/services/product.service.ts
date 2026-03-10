import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
  ProductQueryInput,
  CreateProductInput,
  UpdateProductInput,
} from '@validators/product.validator';

const prisma = new PrismaClient();

class ProductService {
  private async generateCode(): Promise<string> {
    const count = await prisma.product.count();
    const number = (count + 1).toString().padStart(4, '0');
    return `PRD-${number}`;
  }

  async getAll(params: ProductQueryInput) {
    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      supplierId,
      warehouseId,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;


    const offset = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { productName: { contains: search } },
          { code: { contains: search } },
        ],
      }),
      ...(categoryId && { categoryId }),
      ...(supplierId && { supplierId }),
      ...(warehouseId && {
        inventory: {
          some: {
            warehouseId,
          },
        },
      }),
      ...(status && { status: status as any }),
    };

    const total = await prisma.product.count({ where });

    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            categoryName: true,
            categoryCode: true,
          },
        },
        supplier: {
          select: {
            id: true,
            supplierName: true,
            supplierCode: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitCode: true,
            unitName: true,
          },
        },

        inventory: {
          select: {
            quantity: true,
            reservedQuantity: true,
            warehouseId: true,
            warehouse: {
              select: {
                id: true,
                warehouseName: true,
              }
            }
          },
        },
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        _count: {
          select: {
            inventory: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
    });

    const result = {
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    return result;
  }

  async getById(id: number) {

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            categoryName: true,
            categoryCode: true,
          },
        },
        supplier: {
          select: {
            id: true,
            supplierName: true,
            supplierCode: true,
            phone: true,
            email: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitCode: true,
            unitName: true,
          },
        },

        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        updater: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        inventory: {
          include: {
            warehouse: {
              select: {
                id: true,
                warehouseName: true,
                warehouseCode: true,
                warehouseType: true,
              },
            },
          },
        },
        unitConversions: {
          select: {
            unitId: true,
            conversionFactor: true,
          },
        },
        productHasAttributes: {
          select: {
            attributeId: true,
            value: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    return product;
  }

  async create(data: CreateProductInput, userId: number) {
    if (data.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        throw new NotFoundError('Category');
      }
    }

    if (data.supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: data.supplierId },
      });
      if (!supplier) {
        throw new NotFoundError('Supplier');
      }
    }

    const code = data.code || (await this.generateCode());

    const existingCode = await prisma.product.findUnique({
      where: { code },
    });
    if (existingCode) {
      throw new ConflictError('Mã sản phẩm đã tồn tại', { code });
    }

    const product = await prisma.product.create({
      data: {
        code,
        productName: data.productName,
        categoryId: data.categoryId,
        supplierId: data.supplierId,
        unitId: data.unitId,
        description: data.description,
        note: data.note,
        basePrice: data.basePrice,
        price: data.price,
        image: data.image,
        taxIds: data.taxIds ? JSON.parse(JSON.stringify(data.taxIds)) : null,
        applyWarranty: data.applyWarranty || false,
        warrantyPolicy: data.warrantyPolicy ? JSON.parse(JSON.stringify(data.warrantyPolicy)) : null,
        minStockLevel: data.minStockLevel,
        hasExpiry: data.hasExpiry ?? false,
        manageSerial: data.manageSerial ?? false,
        status: (data.status as any) || 'active',
        createdBy: userId,
        ...(data.attributeIdsWithValue && {
          productHasAttributes: {
            create: data.attributeIdsWithValue.map((attr) => ({
              attributeId: attr.attributeId,
              value: attr.value,
            })),
          },
        }),
        ...(data.unitConversions && {
          unitConversions: {
            create: data.unitConversions.map((uc) => ({
              unitId: uc.unitId,
              conversionFactor: uc.conversionFactor,
            })),
          },
        }),
        ...(data.materialIds && {
          materials: {
            create: data.materialIds.map((id) => ({
              materialId: id,
            })),
          },
        }),
      },
      include: {
        category: true,
        supplier: true,
      },
    });

    logActivity('create', userId, 'products', {
      recordId: product.id,
      newValue: product,
    });

    return product;
  }

  async update(id: number, data: UpdateProductInput, userId: number) {
    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      throw new NotFoundError('Product');
    }

    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId as number },
      });
      if (!category) {
        throw new NotFoundError('Category');
      }
    }

    if (data.supplierId !== undefined && data.supplierId !== null) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: data.supplierId as number },
      });
      if (!supplier) {
        throw new NotFoundError('Supplier');
      }
    }

    if (data.code && data.code !== existingProduct.code) {
      const existingCode = await prisma.product.findUnique({
        where: { code: data.code as string },
      });
      if (existingCode) {
        throw new ConflictError('Mã sản phẩm đã tồn tại', { code: data.code });
      }
    }

    const {
      attributeIdsWithValue,
      unitConversions,
      taxIds,
      warrantyPolicy,
      ...restData
    } = data;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...restData,
        taxIds: taxIds !== undefined ? taxIds ? JSON.parse(JSON.stringify(taxIds)) : null : undefined,
        warrantyPolicy: warrantyPolicy !== undefined ? warrantyPolicy ? JSON.parse(JSON.stringify(warrantyPolicy)) : null : undefined,
        updatedBy: userId,
        ...(attributeIdsWithValue && {
          productHasAttributes: {
            deleteMany: {},
            create: attributeIdsWithValue.map((attr) => ({
              attributeId: attr.attributeId,
              value: attr.value,
            })),
          },
        }),
        ...(unitConversions && {
          unitConversions: {
            deleteMany: {},
            create: unitConversions.map((uc) => ({
              unitId: uc.unitId,
              conversionFactor: uc.conversionFactor,
            })),
          },
        }),
        ...(restData.materialIds !== undefined && {
          materials: {
            deleteMany: {},
            create: restData.materialIds ? restData.materialIds.map((id: number) => ({
              materialId: id,
            })) : [],
          },
        }),
      },
      include: {
        category: true,
        supplier: true,
      },
    });

    logActivity('update', userId, 'products', {
      recordId: id,
      oldValue: existingProduct,
      newValue: product,
    });

    return product;
  }

  /**
   * Cập nhật trạng thái Banner (IsFeatured) cho nhiều sản phẩm
   * Đã được xoá cột `isFeatured` khỏi Database ở phiên bản này, 
   * logic giữ tạm để không lỗi Route hoặc có thể xóa luôn.
   */
  async updateBannerStatus(
    action: 'set_featured' | 'unset_featured' | 'reset_all',
    _userId: number,
    _productIds: number[] = []
  ) {
    return {
      success: true,
      action,
      updatedCount: 0,
      affectedIds: [],
    };
  }


  async delete(id: number, userId: number) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        inventory: true,
        purchaseOrderDetails: true,
        invoiceDetails: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    if (product.inventory.length > 0) {
      const totalStock = product.inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
      if (totalStock > 0) {
        throw new ValidationError(
          'Cannot delete product with existing inventory. Please clear inventory first.'
        );
      }
    }

    if (product.purchaseOrderDetails.length > 0 || product.invoiceDetails.length > 0) {
      throw new ValidationError(
        'Cannot delete product that has been used in orders. Consider marking it as inactive instead.'
      );
    }

    // soft delete
    await prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    logActivity('delete', userId, 'products', {
      recordId: id,
      oldValue: product,
    });

    return { message: 'Product deleted successfully' };
  }

  async getLowStock(warehouseId?: number) {
    const products = await prisma.product.findMany({
      where: {
        status: 'active',
        minStockLevel: { gt: 0 },
      },
      include: {
        category: true,
        inventory: warehouseId
          ? {
            where: { warehouseId },
            include: { warehouse: true },
          }
          : {
            include: { warehouse: true },
          },
      },
    });

    const lowStockProducts = products
      .map((product) => {
        const totalStock = product.inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
        const availableStock = product.inventory.reduce(
          (sum, inv) => sum + Number(inv.quantity) - Number(inv.reservedQuantity),
          0
        );

        return {
          ...product,
          totalStock,
          availableStock,
          shortfall: Number(product.minStockLevel) - availableStock,
        };
      })
      .filter((p) => p.availableStock < Number(p.minStockLevel));

    return lowStockProducts;
  }

  async getExpiringSoon(_days: number = 7) {
    // Note: Expiry dates are now tracked at the InventoryBatch level, not the Product level.
    // For a fully accurate report, this should query InventoryBatches and join with Products.
    // Returning empty array for now as per updated tracking logic.
    return [];
  }

  // Image and video upload methods removed - use single image field in Product model instead

  async getStats() {

    // Get all products with counts
    const products = await prisma.product.findMany({
      select: {
        id: true,
        productName: true,
        status: true,
        supplierId: true,
        categoryId: true,
      },
    });

    // Calculate statistics
    const totalProducts = products.length;
    const activeCount = products.filter((p) => p.status === 'active').length;
    const inactiveCount = products.filter((p) => p.status === 'inactive').length;

    const withoutSupplier = products.filter((p) => !p.supplierId).length;
    const withoutCategory = products.filter((p) => !p.categoryId).length;

    const stats = {
      totalProducts,
      byStatus: {
        active: activeCount,
        inactive: inactiveCount,
      },
      byType: {
        rawMaterial: 0,
        packaging: 0,
        finished: 0,
        goods: totalProducts,
      },
      dataQuality: {
        withoutSupplier,
        withoutCategory,
      },
    };

    return stats;
  }

  async getRawMaterialStats() {
    return {
      totalRawMaterials: 0,
      byStatus: { active: 0, inactive: 0 },
      lowStockCount: 0,
      expiringCount: 0,
      totalInventoryValue: 0,
    };
  }

  async getPackagingStats() {
    return {
      totalPackaging: 0,
      byStatus: { active: 0, inactive: 0 },
      lowStockCount: 0,
      expiringCount: 0,
      totalInventoryValue: 0,
    };
  }

  async getGoodsStats() {
    const goods = await prisma.product.findMany({
      include: {
        inventory: true,
      },
    });

    const totalGoods = goods.length;
    const activeCount = goods.filter((p) => p.status === 'active').length;
    const inactiveCount = goods.filter((p) => p.status === 'inactive').length;

    let lowStockCount = 0;
    for (const good of goods) {
      const totalInventory = good.inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
      if (totalInventory < Number(good.minStockLevel)) {
        lowStockCount++;
      }
    }

    let totalInventoryValue = 0;
    for (const good of goods) {
      const totalQuantity = good.inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
      const basePrice = Number(good.basePrice) || 0;
      totalInventoryValue += totalQuantity * basePrice;
    }

    const stats = {
      totalPackaging: totalGoods,
      byStatus: {
        active: activeCount,
        inactive: inactiveCount,
      },
      lowStockCount,
      expiringCount: 0,
      totalInventoryValue,
    };

    return stats;
  }
}

export default new ProductService();
