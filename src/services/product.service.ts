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
  private resolveLegacyProductTypeFilter(productType?: string): Prisma.ProductWhereInput {
    if (!productType) return {};

    const normalized = productType.trim().toLowerCase();

    // Legacy public filters from frontend
    if (normalized === 'sầu riêng' || normalized === 'sau rieng') {
      return { productName: { contains: 'Sầu Riêng' } };
    }

    if (normalized === 'lúa' || normalized === 'lua') {
      return { productName: { contains: 'Lúa' } };
    }

    if (normalized === 'khác' || normalized === 'khac') {
      return {
        AND: [
          { productName: { not: { contains: 'Sầu Riêng' } } },
          { productName: { not: { contains: 'Lúa' } } },
        ],
      };
    }

    // Backward-compatible mapping from old productType semantics to current Product.type enum
    if (['hàng hóa', 'hang hoa', 'goods', 'finished_product', 'product'].includes(normalized)) {
      return { type: 'PRODUCT' };
    }

    if (['raw_material', 'material', 'nguyên liệu', 'nguyen lieu'].includes(normalized)) {
      return { type: 'MATERIAL' };
    }

    if (['packaging', 'bao bì', 'bao bi'].includes(normalized)) {
      return { type: 'PACKAGING' };
    }

    return {};
  }

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
      type,
      productType,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params as any;


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
      ...(type && { type: type as any }),
      ...this.resolveLegacyProductTypeFilter(productType),
    };

    const total = await prisma.product.count({ where });

    const [products, allTaxes] = await Promise.all([
      prisma.product.findMany({
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
        unitConversions: {
          select: {
            unitId: true,
            conversionFactor: true,
            unit: {
              select: {
                id: true,
                unitCode: true,
                unitName: true,
              }
            }
          },
        },
        priceHistories: {
          orderBy: { createdAt: 'desc' },
          include: { updater: { select: { fullName: true } } }
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
    }),
    prisma.tax.findMany()
  ]);

    const result = {
      products: products.map(product => {
        const totalStock = product.inventory.reduce((sum, item) => sum + Number(item.quantity), 0);
        
        let productTaxes: any[] = [];
        if (product.taxIds && Array.isArray(product.taxIds)) {
            productTaxes = allTaxes.filter(t => (product.taxIds as number[]).includes(t.id));
        }

        return {
          ...product,
          totalStock,
          taxes: productTaxes
        };
      }),
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
        priceHistories: {
          orderBy: { createdAt: 'desc' },
          include: { updater: { select: { fullName: true } } }
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    const totalStock = product.inventory.reduce((sum, item) => sum + Number(item.quantity), 0);

    return {
      ...product,
      totalStock
    };
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
        type: (data.type as any) || 'PRODUCT',
        ...(data.categoryId !== undefined && data.categoryId !== null && {
          category: { connect: { id: Number(data.categoryId) } },
        }),
        ...(data.supplierId !== undefined && data.supplierId !== null && {
          supplier: { connect: { id: Number(data.supplierId) } },
        }),
        ...(data.unitId !== undefined && data.unitId !== null && {
          unit: { connect: { id: Number(data.unitId) } },
        }),
        creator: { connect: { id: userId } },
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
        priceHistories: {
          create: {
            oldPrice: 0,
            newPrice: data.price ? Number(data.price) : 0,
            updatedBy: userId,
          }
        },
        productMaterials: {
          create: data.materialIds ? data.materialIds.map((id) => ({
            materialId: id,
          })) : [],
        }
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
      materialIds,
      categoryId,
      supplierId,
      unitId,
      ...restData
    } = data;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...restData,
        ...(categoryId !== undefined && {
          category:
            categoryId === null
              ? { disconnect: true }
              : { connect: { id: Number(categoryId) } },
        }),
        ...(supplierId !== undefined && {
          supplier:
            supplierId === null
              ? { disconnect: true }
              : { connect: { id: Number(supplierId) } },
        }),
        ...(unitId !== undefined && {
          unit:
            unitId === null
              ? { disconnect: true }
              : { connect: { id: Number(unitId) } },
        }),
        taxIds: taxIds !== undefined ? taxIds ? JSON.parse(JSON.stringify(taxIds)) : null : undefined,
        warrantyPolicy: warrantyPolicy !== undefined ? warrantyPolicy ? JSON.parse(JSON.stringify(warrantyPolicy)) : null : undefined,
        updater: { connect: { id: userId } },
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
        ...(materialIds !== undefined && {
          productMaterials: {
            deleteMany: {},
            create: materialIds ? materialIds.map((id: number) => ({
              materialId: id,
            })) : [],
          },
        }),
        // Only append to price history if price actually changed
        ...(restData.price !== undefined && Number(restData.price) !== Number(existingProduct.price) && {
          priceHistories: {
            create: {
              oldPrice: existingProduct.price ? Number(existingProduct.price) : 0,
              newPrice: Number(restData.price),
              updatedBy: userId,
            }
          }
        })
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

  async getSaleHistory(productId: number, query: any) {
    const { page = 1, limit = 10, fromDate, toDate } = query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: Prisma.InvoiceDetailWhereInput = {
      productId,
      order: {
        orderStatus: 'completed',
        deletedAt: null,
        ...(fromDate && toDate && {
          orderDate: {
            gte: new Date(fromDate),
            lte: new Date(`${toDate}T23:59:59.999Z`),
          },
        }),
      },
    };

    const total = await prisma.invoiceDetail.count({ where });

    const data = await prisma.invoiceDetail.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            orderStatus: true,
            createdAt: true,
            customer: {
              select: {
                id: true,
                customerName: true,
                phone: true,
                email: true,
                address: true,
                taxCode: true,
              },
            },
          },
        },
      },
      orderBy: { 
        order: {
          createdAt: 'desc' 
        }
      },
      skip: offset,
      take: Number(limit),
    });

    const allRecords = await prisma.invoiceDetail.findMany({
      where,
      select: {
        quantity: true,
        unitName: true,
      },
    });

    const totalsByUnitObj: Record<string, number> = {};
    for (const record of allRecords) {
      const uName = record.unitName || 'Default';
      totalsByUnitObj[uName] = (totalsByUnitObj[uName] || 0) + Number(record.quantity);
    }

    const totalsByUnit = Object.keys(totalsByUnitObj).map((k) => ({
      unitName: k,
      total: totalsByUnitObj[k],
    }));

    // Format response to match existing frontend mapping (customer.name vs customer.customerName)
    const formattedData = data.map((item) => ({
      ...item,
      invoice: item.order ? {
        ...item.order,
        code: item.order.orderCode,
        customer: item.order.customer ? {
          ...item.order.customer,
          name: item.order.customer.customerName,
        } : null
      } : null,
      createdAt: item.order?.createdAt, // for frontend sorting/display
    }));

    return {
      data: formattedData,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
      totalsByUnit,
    };
  }

  async getStats() {

    // Get all products with counts
    const products = await prisma.product.findMany({
      select: {
        id: true,
        productName: true,
        status: true,
        type: true,
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
        rawMaterial: products.filter((p) => p.type === 'MATERIAL').length,
        packaging: products.filter((p) => p.type === 'PACKAGING').length,
        finished: 0,
        goods: products.filter((p) => p.type === 'PRODUCT').length,
      },
      dataQuality: {
        withoutSupplier,
        withoutCategory,
      },
    };

    return stats;
  }

  async getRawMaterialStats() {
    const materials = await prisma.product.findMany({
      where: {
        type: 'MATERIAL',
        deletedAt: null,
      },
      include: {
        inventory: true,
      },
    });

    const totalRawMaterials = materials.length;
    const activeCount = materials.filter((p) => p.status === 'active').length;
    const inactiveCount = materials.filter((p) => p.status === 'inactive').length;

    let lowStockCount = 0;
    for (const p of materials) {
      const totalInventory = p.inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
      if (totalInventory < Number(p.minStockLevel)) {
        lowStockCount++;
      }
    }

    let totalInventoryValue = 0;
    for (const p of materials) {
      const totalQuantity = p.inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
      const basePrice = Number(p.basePrice) || 0;
      totalInventoryValue += totalQuantity * basePrice;
    }

    return {
      totalRawMaterials,
      byStatus: {
        active: activeCount,
        inactive: inactiveCount,
      },
      lowStockCount,
      expiringCount: 0,
      totalInventoryValue,
    };
  }

  async getPackagingStats() {
    const packagingItems = await prisma.product.findMany({
      where: {
        type: 'PACKAGING',
        deletedAt: null,
      },
      include: {
        inventory: true,
      },
    });

    const totalPackaging = packagingItems.length;
    const activeCount = packagingItems.filter((p) => p.status === 'active').length;
    const inactiveCount = packagingItems.filter((p) => p.status === 'inactive').length;

    let lowStockCount = 0;
    for (const p of packagingItems) {
      const totalInventory = p.inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
      if (totalInventory < Number(p.minStockLevel)) {
        lowStockCount++;
      }
    }

    let totalInventoryValue = 0;
    for (const p of packagingItems) {
      const totalQuantity = p.inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
      const basePrice = Number(p.basePrice) || 0;
      totalInventoryValue += totalQuantity * basePrice;
    }

    return {
      totalPackaging,
      byStatus: {
        active: activeCount,
        inactive: inactiveCount,
      },
      lowStockCount,
      expiringCount: 0,
      totalInventoryValue,
    };
  }

  async getGoodsStats() {
    const goods = await prisma.product.findMany({
      where: {
        type: 'PRODUCT',
        deletedAt: null,
      },
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
      totalGoods,
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
