import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
  type AlertInventoryQueryInput,
  type InventoryQueryInput,
} from '@validators/inventory.validator';

const prisma = new PrismaClient();

class InventoryService {
  // Lấy danh sách tồn kho với các bộ lọc tùy chọn
  async getAll(query: InventoryQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      warehouseId,
      productId,
      productIds, // Comma-separated product IDs
      warehouseType,
      categoryId,
      lowStock,
      outOfStock,
      sortBy = 'productId',
      sortOrder = 'asc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const parsedProductIds = productIds ? productIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];

    const where: Prisma.InventoryWhereInput = {
      ...(search && {
        OR: [
          { product: { productName: { contains: search } } },
          { product: { code: { contains: search } } },
          { warehouse: { warehouseName: { contains: search } } },
        ],
      }),
      ...(warehouseId && { warehouseId: Number(warehouseId) }),
      ...(productId && { productId: Number(productId) }),
      ...(parsedProductIds.length > 0 && { productId: { in: parsedProductIds } }),
      ...(warehouseType && {
        warehouse: {
          warehouseType: warehouseType as any,
        },
      }),
      ...(categoryId && {
        product: {
          categoryId: Number(categoryId),
        },
      }),
    };

    let [inventories, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          quantity: true,
          reservedQuantity: true,
          warehouseId: true,
          productId: true,
          warehouse: {
            select: {
              id: true,
              warehouseName: true,
              warehouseCode: true,
            },
          },
          product: {
            select: {
              id: true,
              code: true,
              productName: true,
              unitId: true,
              unit: { select: { unitCode: true, unitName: true } },
              minStockLevel: true,
              basePrice: true,
            },
          },
        },
      }),
      prisma.inventory.count({ where }),
    ]);

    if (Boolean(lowStock)) {
      inventories = inventories.filter(
        (inv) =>
          Number(inv.quantity) - Number(inv.reservedQuantity) < Number(inv.product.minStockLevel)
      );
      total = inventories.length;
    }

    if (Boolean(outOfStock)) {
      inventories = inventories.filter(
        (inv) => Number(inv.quantity) - Number(inv.reservedQuantity) <= 0
      );
      total = inventories.length;
    }

    const inventoryWithCalc = inventories.map((inv) => ({
      ...inv,
      availableQuantity: Number(inv.quantity) - Number(inv.reservedQuantity),
    }));

    // Stats
    const totalValue = inventories.reduce((sum, item) => {
      const value = Number(item.quantity) * Number(item.product?.basePrice || 0);
      return sum + value;
    }, 0);
    const lowStockItems = inventories.filter((item) => {
      const available = Number(item.quantity) - Number(item.reservedQuantity);
      const minLevel = Number(item.product?.minStockLevel || 0);
      return available < minLevel;
    }).length;
    const reservedQuantity = inventories.reduce(
      (sum, item) => sum + Number(item.reservedQuantity),
      0
    );
    const expiredQuantity = 0; // Expiry dates are now tracked only in inventory tracking/receipts, not product level.

    const result = {
      data: inventoryWithCalc,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      cards: {
        totalValue,
        lowStockItems,
        reservedQuantity,
        expiredQuantity,
      },
      message: 'Lấy danh sách tồn kho thành công',
    };

    return result;
  }

  async getAlerts(query: AlertInventoryQueryInput) {
    const { page = '1', limit = '20', search, warehouseId } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.InventoryWhereInput = {
      ...(search && {
        OR: [
          { product: { productName: { contains: search } } },
          { product: { code: { contains: search } } },
          { warehouse: { warehouseName: { contains: search } } },
        ],
      }),
      ...(warehouseId && { warehouseId: Number(warehouseId) }),
      product: {
        minStockLevel: { gt: 0 },
        status: 'active',
      },
    };

    const includeConfig = {
      warehouse: {
        select: {
          id: true,
          warehouseName: true,
          warehouseCode: true,
          warehouseType: true,
        },
      },
      product: {
        select: {
          id: true,
          sku: true,
          productName: true,
          productType: true,
          unitId: true,
          unit: { select: { unitCode: true, unitName: true } },
          minStockLevel: true,
          category: {
            select: {
              id: true,
              categoryName: true,
            },
          },
        },
      },
    };

    const allInventories = await prisma.inventory.findMany({
      where,
      include: includeConfig,
    });

    const allAlerts = allInventories
      .map((inv) => {
        const availableQty = Number(inv.quantity) - Number(inv.reservedQuantity);
        const minLevel = Number(inv.product.minStockLevel);

        return {
          ...inv,
          availableQuantity: availableQty,
          shortfall: minLevel - availableQty,
          percentageOfMin: minLevel > 0 ? (availableQty / minLevel) * 100 : 0,
        };
      })
      .filter((inv) => inv.availableQuantity < Number(inv.product.minStockLevel))
      .sort((a, b) => a.percentageOfMin - b.percentageOfMin);

    const summary = {
      totalAlerts: allAlerts.length,
      outOfStock: allAlerts.filter((a) => a.availableQuantity === 0).length,
      critical: allAlerts.filter((a) => a.availableQuantity > 0 && a.percentageOfMin < 25).length,
      warning: allAlerts.filter((a) => a.percentageOfMin >= 25 && a.percentageOfMin < 50).length,
      low: allAlerts.filter((a) => a.percentageOfMin >= 50 && a.percentageOfMin < 100).length,
    };

    const paginatedAlerts = allAlerts.slice(skip, skip + limitNum);

    const result = {
      data: {
        alerts: paginatedAlerts,
        summary,
      },
      meta: {
        page: pageNum,
        limit: limitNum,
        total: allAlerts.length,
        totalPages: Math.ceil(allAlerts.length / limitNum),
      },
      message: 'Lấy cảnh báo tồn kho thành công',
    };

    return result;
  }

  async getByWarehouse(warehouseId: number) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });

    if (!warehouse) {
      throw new NotFoundError('Không tìm thấy kho này');
    }

    let inventory = await prisma.inventory.findMany({
      where: { warehouseId },
      select: {
        quantity: true,
        reservedQuantity: true,
        warehouseId: true,
        productId: true,
        product: {
          select: {
            minStockLevel: true,
            code: true,
            productName: true,
          },
        },
      },
      orderBy: { productId: 'asc' },
    });

    inventory = inventory.map((inv) => ({
      ...inv,
      availableQuantity: Number(inv.quantity) - Number(inv.reservedQuantity),
    }));

    const result = {
      data: inventory,
    };

    return result;
  }

  // Lấy tồn kho theo sản phẩm (trên tất cả kho)
  async getByProduct(productId: number) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundError('Không tìm thấy sản phẩm này');
    }

    const inventory = await prisma.inventory.findMany({
      where: { productId },
      include: {
        warehouse: {
          select: {
            id: true,
            warehouseName: true,
            warehouseCode: true,
            warehouseType: true,
            city: true,
            region: true,
            status: true,
          },
        },
      },
      orderBy: { warehouseId: 'asc' },
    });

    const approvedPOs = await prisma.purchaseOrder.findMany({
      where: {
        status: 'approved',
        details: {
          some: {
            productId: productId,
          },
        },
      },
      include: {
        details: {
          where: {
            productId: productId,
          },
        },
      },
    });

    const totalQuantity = inventory.reduce((sum, inv) => sum + Number(inv.quantity), 0);
    const totalReserved = inventory.reduce((sum, inv) => sum + Number(inv.reservedQuantity), 0);
    const totalAvailable = totalQuantity - totalReserved;

    const onOrderQuantity = approvedPOs.reduce((sum, po) => {
      const detail = po.details[0];
      return sum + Number(detail?.quantity || 0);
    }, 0);

    const result = {
      product: {
        id: product.id,
        code: product.code,
        productName: product.productName,
        unitId: product.unitId,
        minStockLevel: product.minStockLevel,
      },
      warehouses: inventory.map((inv) => ({
        ...inv,
        availableQuantity: Number(inv.quantity) - Number(inv.reservedQuantity),
      })),
      summary: {
        totalQuantity,
        totalReserved,
        totalAvailable,
        onOrderQuantity,
        warehouseCount: inventory.length,
      },
    };

    return result;
  }

  async checkAvailability(
    items: Array<{
      productId: number;
      warehouseId: number;
      quantity: number;
    }>
  ) {
    const results = [];

    for (const item of items) {
      const inventory = await prisma.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: item.warehouseId,
            productId: item.productId,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              code: true,
              productName: true,
              unitId: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              warehouseName: true,
              warehouseCode: true,
            },
          },
        },
      });

      if (!inventory) {
        results.push({
          productId: item.productId,
          warehouseId: item.warehouseId,
          requestedQuantity: item.quantity,
          availableQuantity: 0,
          isAvailable: false,
          message: 'Sản phẩm không tồn tại trong kho này',
        });
        continue;
      }

      const availableQty = Number(inventory.quantity) - Number(inventory.reservedQuantity);

      results.push({
        productId: item.productId,
        warehouseId: item.warehouseId,
        product: inventory.product,
        warehouse: inventory.warehouse,
        requestedQuantity: item.quantity,
        currentQuantity: Number(inventory.quantity),
        reservedQuantity: Number(inventory.reservedQuantity),
        availableQuantity: availableQty,
        isAvailable: availableQty >= item.quantity,
        shortfall: Math.max(0, item.quantity - availableQty),
        message:
          availableQty >= item.quantity
            ? 'Có sẵn'
            : `Không đủ hàng. Cần thêm ${item.quantity - availableQty}`,
      });
    }

    const allAvailable = results.every((r) => r.isAvailable);

    return {
      allAvailable,
      items: results,
      summary: {
        totalItems: results.length,
        availableItems: results.filter((r) => r.isAvailable).length,
        unavailableItems: results.filter((r) => !r.isAvailable).length,
      },
    };
  }

  async update(
    data: {
      warehouseId: number;
      productId: number;
      quantity: number;
      reservedQuantity?: number;
      reason: string;
    },
    userId: number
  ) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError('Không tìm thấy kho này');
    }

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
    });
    if (!product) {
      throw new NotFoundError('Không tìm thấy sản phẩm này');
    }

    const existing = await prisma.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: data.warehouseId,
          productId: data.productId,
        },
      },
    });

    const inventory = await prisma.inventory.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: data.warehouseId,
          productId: data.productId,
        },
      },
      create: {
        warehouseId: data.warehouseId,
        productId: data.productId,
        quantity: data.quantity,
        reservedQuantity: data.reservedQuantity || 0,
        updatedBy: userId,
      },
      update: {
        quantity: data.quantity,
        ...(data.reservedQuantity !== undefined && { reservedQuantity: data.reservedQuantity }),
        updatedBy: userId,
      },
      include: {
        warehouse: true,
        product: true,
      },
    });

    logActivity('update', userId, 'inventory', {
      recordId: inventory.id,
      oldValue: existing,
      newValue: inventory,
      reason: data.reason,
    });

    return {
      ...inventory,
      availableQuantity: Number(inventory.quantity) - Number(inventory.reservedQuantity),
    };
  }

  async adjust(
    data: {
      warehouseId: number;
      productId: number;
      adjustment: number;
      reason: string;
    },
    userId: number
  ) {
    const current = await prisma.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: data.warehouseId,
          productId: data.productId,
        },
      },
    });

    if (!current) {
      throw new NotFoundError('Không tìm thấy bản ghi tồn kho');
    }

    const newQuantity = Number(current.quantity) + data.adjustment;

    if (newQuantity < 0) {
      throw new ValidationError('Điều chỉnh sẽ làm cho số lượng âm');
    }

    return this.update(
      {
        warehouseId: data.warehouseId,
        productId: data.productId,
        quantity: newQuantity,
        reason: data.reason,
      },
      userId
    );
  }

  async reserve(
    items: Array<{
      productId: number;
      warehouseId: number;
      quantity: number;
    }>,
    referenceType: string,
    referenceId: number,
    userId: number
  ) {
    const availabilityCheck = await this.checkAvailability(items);
    if (!availabilityCheck.allAvailable) {
      throw new ValidationError('Không đủ hàng tồn kho', {
        unavailableItems: availabilityCheck.items.filter((i) => !i.isAvailable),
      });
    }

    const reserved = [];
    for (const item of items) {
      const current = await prisma.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: item.warehouseId,
            productId: item.productId,
          },
        },
      });

      if (!current) {
        throw new NotFoundError('Không tìm thấy bản ghi tồn kho');
      }

      const newReserved = Number(current.reservedQuantity) + item.quantity;

      const updated = await prisma.inventory.update({
        where: {
          warehouseId_productId: {
            warehouseId: item.warehouseId,
            productId: item.productId,
          },
        },
        data: {
          reservedQuantity: newReserved,
          updatedBy: userId,
        },
        include: {
          product: {
            select: {
              id: true,
              code: true,
              productName: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              warehouseName: true,
            },
          },
        },
      });

      reserved.push({
        ...updated,
        reservedAmount: item.quantity,
        availableQuantity: Number(updated.quantity) - Number(updated.reservedQuantity),
      });
    }

    logActivity('update', userId, 'inventory', {
      action: 'reserve',
      referenceType,
      referenceId,
      items: reserved,
    });

    return {
      message: 'Đặt chỗ tồn kho thành công',
      items: reserved,
    };
  }

  async releaseReserved(
    items: Array<{
      productId: number;
      warehouseId: number;
      quantity: number;
    }>,
    referenceType: string,
    referenceId: number,
    userId: number
  ) {
    const released = [];

    for (const item of items) {
      const current = await prisma.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: item.warehouseId,
            productId: item.productId,
          },
        },
      });

      if (!current) {
        throw new NotFoundError('Không tìm thấy bản ghi tồn kho');
      }

      const newReserved = Math.max(0, Number(current.reservedQuantity) - item.quantity);

      const updated = await prisma.inventory.update({
        where: {
          warehouseId_productId: {
            warehouseId: item.warehouseId,
            productId: item.productId,
          },
        },
        data: {
          reservedQuantity: newReserved,
          updatedBy: userId,
        },
        include: {
          product: {
            select: {
              id: true,
              code: true,
              productName: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              warehouseName: true,
            },
          },
        },
      });

      released.push({
        ...updated,
        releasedAmount: item.quantity,
        availableQuantity: Number(updated.quantity) - Number(updated.reservedQuantity),
      });
    }

    logActivity('update', userId, 'inventory', {
      action: 'release_reserved',
      referenceType,
      referenceId,
      items: released,
    });

    return {
      message: 'Giải phóng tồn kho đã đặt chỗ thành công',
      items: released,
    };
  }

  async getValueReport(warehouseId?: number) {
    const where: Prisma.InventoryWhereInput = {
      ...(warehouseId && { warehouseId }),
      quantity: { gt: 0 },
    };

    const inventory = await prisma.inventory.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            warehouseName: true,
            warehouseCode: true,
            warehouseType: true,
          },
        },
        product: {
          select: {
            id: true,
            code: true,
            productName: true,
            unitId: true,
            unit: { select: { unitCode: true, unitName: true } },
            basePrice: true,
            price: true,
          },
        },
      },
    });

    const report = inventory.map((inv) => {
      const qty = Number(inv.quantity);
      const purchasePrice = Number(inv.product.basePrice || 0);
      const sellingPrice = Number(inv.product.price || 0);

      return {
        ...inv,
        quantity: qty,
        purchaseValue: qty * purchasePrice,
        potentialValue: qty * sellingPrice,
        potentialProfit: qty * (sellingPrice - purchasePrice),
      };
    });

    const totalPurchaseValue = report.reduce((sum, item) => sum + item.purchaseValue, 0);
    const totalPotentialValue = report.reduce((sum, item) => sum + item.potentialValue, 0);
    const totalPotentialProfit = report.reduce((sum, item) => sum + item.potentialProfit, 0);

    return {
      items: report,
      summary: {
        totalItems: report.length,
        totalPurchaseValue,
        totalPotentialValue,
        totalPotentialProfit,
        profitMargin:
          totalPurchaseValue > 0
            ? ((totalPotentialProfit / totalPurchaseValue) * 100).toFixed(2) + '%'
            : '0%',
      },
    };
  }

  async deductInventoryBatchFEFO(
    tx: any,
    warehouseId: number,
    productId: number,
    quantityToDeduct: number,
    userId: number
  ) {
    let remainingQuantity = quantityToDeduct;
    const deductedBatches = [];

    // Lấy danh sách các lô còn hàng, sắp xếp theo Ngày hết hạn (FEFO)
    const batches = await tx.inventoryBatch.findMany({
      where: {
        warehouseId,
        productId,
        quantity: { gt: 0 }
      },
      orderBy: [
        { expiryDate: 'asc' },
        { id: 'asc' }
      ]
    });

    for (const batch of batches) {
      if (remainingQuantity <= 0) break;

      const availableInBatch = Number(batch.quantity);
      const deductAmount = Math.min(availableInBatch, remainingQuantity);

      // Cập nhật số lượng của lô
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          quantity: { decrement: deductAmount },
          updatedBy: userId
        }
      });

      deductedBatches.push({
        inventoryBatchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        quantity: deductAmount
      });

      remainingQuantity -= deductAmount;
    }

    return deductedBatches;
  }
}

export default new InventoryService();
