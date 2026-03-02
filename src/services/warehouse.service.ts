import { PrismaClient, Prisma, WarehouseStatus } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  QueryWarehousesInput,
} from '@validators/warehouse.validator';

const prisma = new PrismaClient();

class WarehouseService {
  async getAllWarehouses(query: QueryWarehousesInput) {
    const {
      page = '1',
      limit = '20',
      search,
      warehouseType,
      status,
      city,
      region,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.WarehouseWhereInput = {
      ...(search && {
        OR: [
          { warehouseName: { contains: search } },
          { warehouseCode: { contains: search } },
          { address: { contains: search } },
          { city: { contains: search } },
          { region: { contains: search } },
        ],
      }),
      ...(warehouseType && { warehouseType }),
      ...(status && { status }),
      ...(city && { city: { contains: city } }),
      ...(region && { region: { contains: region } }),
    };

    const [warehouses, total] = await Promise.all([
      prisma.warehouse.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          warehouseCode: true,
          warehouseName: true,
          warehouseType: true,
          address: true,
          city: true,
          region: true,
          description: true,
          managerId: true,
          capacity: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          manager: {
            select: {
              id: true,
              employeeCode: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
          _count: {
            select: {
              inventory: true,
              stockTransactions: true,
              purchaseOrders: true,
              salesOrders: true,
            },
          },
        },
      }),
      prisma.warehouse.count({ where }),
    ]);

    // Cards
    const [activeWarehouses, warehousesCreatedThisMonth, allInventory] = await Promise.all([
      // Active warehouses
      prisma.warehouse.count({
        where: {
          status: 'active',
          ...where,
        },
      }),

      // Created this month
      prisma.warehouse.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
          },
          ...where,
        },
      }),

      // All inventory to calculate total value (filtered by warehouse conditions)
      prisma.inventory.findMany({
        where: {
          warehouse: where,
        },
        select: {
          quantity: true,
          product: {
            select: {
              purchasePrice: true,
            },
          },
        },
      }),
    ]);

    // Calculate total inventory value (quantity * price)
    const totalInventoryValue = allInventory.reduce((sum, item) => {
      const quantity =
        typeof item.quantity === 'object' ? item.quantity.toNumber() : Number(item.quantity);
      const price = item.product?.purchasePrice
        ? typeof item.product.purchasePrice === 'object'
          ? item.product.purchasePrice.toNumber()
          : Number(item.product.purchasePrice)
        : 0;
      const value = quantity * price;
      return sum + value;
    }, 0);

    const result = {
      data: warehouses,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      cards: {
        totalWarehouses: total,
        activeWarehouses,
        createdThisMonth: warehousesCreatedThisMonth,
        totalInventoryValue,
      },
      message: 'Lấy danh sách kho thành công',
    };

    return result;
  }

  async getWarehouseById(id: number) {

    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      select: {
        id: true,
        warehouseCode: true,
        warehouseName: true,
        warehouseType: true,
        address: true,
        city: true,
        region: true,
        description: true,
        managerId: true,
        capacity: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        manager: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
        users: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            email: true,
            phone: true,
            role: {
              select: {
                id: true,
                roleName: true,
              },
            },
          },
        },
        _count: {
          select: {
            inventory: true,
            stockTransactions: true,
            purchaseOrders: true,
            salesOrders: true,
            productionOrders: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundError('Không tìm thấy kho này');
    }

    return warehouse;
  }

  async createWarehouse(data: CreateWarehouseInput, createdBy: number) {
    const codeExists = await this.checkWarehouseCodeExists(data.warehouseCode);
    if (codeExists) {
      throw new ConflictError('Mã kho đã tồn tại');
    }

    if (data.managerId) {
      const managerExists = await prisma.user.findUnique({
        where: { id: data.managerId },
      });
      if (!managerExists) {
        throw new NotFoundError('Không tìm thấy người quản lý');
      }
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        warehouseCode: data.warehouseCode,
        warehouseName: data.warehouseName,
        warehouseType: data.warehouseType,
        address: data.address || null,
        city: data.city || null,
        region: data.region || null,
        description: data.description || null,
        managerId: data.managerId || null,
        capacity: data.capacity || null,
        status: data.status || 'active',
      },
      select: {
        id: true,
        warehouseCode: true,
        warehouseName: true,
        warehouseType: true,
        address: true,
        city: true,
        region: true,
        description: true,
        managerId: true,
        capacity: true,
        status: true,
        createdAt: true,
        manager: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    logActivity('create', createdBy, 'warehouses', {
      recordId: warehouse.id,
      newValue: warehouse,
    });

    return warehouse;
  }

  async updateWarehouse(id: number, data: UpdateWarehouseInput, updatedBy: number) {
    const existingWarehouse = await prisma.warehouse.findUnique({
      where: { id },
    });

    if (!existingWarehouse) {
      throw new NotFoundError('Không tìm thấy kho này');
    }

    if (data.warehouseCode && data.warehouseCode !== existingWarehouse.warehouseCode) {
      const codeExists = await this.checkWarehouseCodeExists(data.warehouseCode, id);
      if (codeExists) {
        throw new ConflictError('Mã kho đã tồn tại');
      }
    }

    if (data.managerId) {
      const managerExists = await prisma.user.findUnique({
        where: { id: data.managerId },
      });
      if (!managerExists) {
        throw new NotFoundError('Không tìm thấy người quản lý');
      }
    }

    const updatedWarehouse = await prisma.warehouse.update({
      where: { id },
      data: {
        ...(data.warehouseCode && { warehouseCode: data.warehouseCode }),
        ...(data.warehouseName && { warehouseName: data.warehouseName }),
        ...(data.warehouseType && { warehouseType: data.warehouseType }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.region !== undefined && { region: data.region }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.managerId !== undefined && { managerId: data.managerId }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        ...(data.status && { status: data.status }),
      },
      select: {
        id: true,
        warehouseCode: true,
        warehouseName: true,
        warehouseType: true,
        address: true,
        city: true,
        region: true,
        description: true,
        managerId: true,
        capacity: true,
        status: true,
        updatedAt: true,
        manager: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    logActivity('update', updatedBy, 'warehouses', {
      recordId: id,
      oldValue: existingWarehouse,
      newValue: updatedWarehouse,
    });

    return updatedWarehouse;
  }

  async deleteWarehouse(id: number, deletedBy: number) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            inventory: true,
            stockTransactions: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundError('Không tìm thấy kho này');
    }

    if (warehouse._count.inventory > 0) {
      throw new ValidationError('Không thể xóa kho vì đang có hàng tồn kho');
    }

    if (warehouse._count.stockTransactions > 0) {
      throw new ValidationError('Không thể xóa kho vì đang có giao dịch');
    }

    await prisma.warehouse.delete({
      where: { id },
    });

    logActivity('delete', deletedBy, 'warehouses', {
      recordId: id,
      oldValue: warehouse,
    });

    return { message: 'Đã xóa kho thành công' };
  }

  async getWarehouseStatistics(id: number) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
    });

    if (!warehouse) {
      throw new NotFoundError('Không tìm thấy kho này');
    }

    const inventoryStats = await prisma.inventory.aggregate({
      where: { warehouseId: id },
      _count: { id: true },
      _sum: {
        quantity: true,
        reservedQuantity: true,
      },
    });

    // Lấy giá trị tồn kho = sum(quantity * purchasePrice)
    const inventoryWithPrice = await prisma.inventory.findMany({
      where: { warehouseId: id },
      select: {
        quantity: true,
        product: {
          select: {
            purchasePrice: true,
          },
        },
      },
    });

    let totalInventoryValue = 0;
    for (const item of inventoryWithPrice) {
      const price = item.product?.purchasePrice ? Number(item.product.purchasePrice) : 0;
      const quantity = Number(item.quantity);
      totalInventoryValue += price * quantity;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const transactionStats = await prisma.stockTransaction.groupBy({
      by: ['transactionType'],
      where: {
        warehouseId: id,
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      _count: {
        id: true,
      },
    });

    const totalProducts = await prisma.inventory.count({
      where: { warehouseId: id },
    });

    const stats = {
      warehouseId: id,
      warehouseName: warehouse.warehouseName,
      warehouseType: warehouse.warehouseType,
      inventory: {
        totalProducts: inventoryStats._count.id || 0,
        totalQuantity: inventoryStats._sum.quantity || 0,
        reservedQuantity: inventoryStats._sum.reservedQuantity || 0,
        availableQuantity:
          Number(inventoryStats._sum?.quantity ?? 0) -
          Number(inventoryStats._sum?.reservedQuantity ?? 0),
        totalValue: totalInventoryValue,
      },
      transactions: {
        last30Days: transactionStats.reduce((acc, stat) => {
          acc[stat.transactionType] = stat._count.id;
          return acc;
        }, {} as Record<string, number>),
      },
      capacity: {
        total: warehouse.capacity,
        used: totalProducts,
        available: warehouse.capacity ? Number(warehouse.capacity) - totalProducts : null,
        utilizationPercent: warehouse.capacity
          ? (totalProducts / Number(warehouse.capacity)) * 100
          : null,
      },
    };

    return stats;
  }

  async checkWarehouseCodeExists(code: string, excludeId?: number): Promise<boolean> {
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        warehouseCode: code,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    return !!warehouse;
  }

  async updateStatus(id: number, status: WarehouseStatus, updatedBy: number) {
    const existingWarehouse = await prisma.warehouse.findUnique({
      where: { id },
    });

    if (!existingWarehouse) {
      throw new NotFoundError('Không tìm thấy kho này');
    }

    const updatedWarehouse = await prisma.warehouse.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        warehouseCode: true,
        warehouseName: true,
        warehouseType: true,
        status: true,
        updatedAt: true,
      },
    });

    logActivity('update_status', updatedBy, 'warehouses', {
      recordId: id,
      oldValue: existingWarehouse.status,
      newValue: updatedWarehouse.status,
    });

    return updatedWarehouse;
  }

  async bulkDelete(ids: number[], deletedBy: number) {
    const warehouses = await prisma.warehouse.findMany({
      where: { id: { in: ids } },
      include: {
        _count: {
          select: { inventory: true, stockTransactions: true },
        },
      },
    });

    if (warehouses.length === 0) {
      throw new NotFoundError('Không tìm thấy kho nào để xóa');
    }

    const validIds = warehouses
      .filter((w) => w._count.inventory === 0 && w._count.stockTransactions === 0)
      .map((w) => w.id);

    if (validIds.length === 0) {
      throw new ConflictError('Không thể xóa các kho đã chọn vì đang có hàng tồn hoặc giao dịch');
    }

    await prisma.warehouse.deleteMany({
      where: { id: { in: validIds } },
    });

    logActivity('bulk_delete', deletedBy, 'warehouses', {
      deletedIds: validIds,
      totalRequested: ids.length,
      totalDeleted: validIds.length,
    });

    return {
      message: `Đã xóa thành công ${validIds.length}/${ids.length} kho`,
    };
  }

  async importWarehouses(items: any[], createdBy: number) {
    let successCount = 0;
    const errors: any[] = [];

    for (const [index, item] of items.entries()) {
      try {
        const codeExists = await this.checkWarehouseCodeExists(item.warehouseCode);
        if (codeExists) {
          throw new Error(`Mã kho '${item.warehouseCode}' đã tồn tại`);
        }

        await prisma.warehouse.create({
          data: {
            warehouseCode: item.warehouseCode,
            warehouseName: item.warehouseName,
            warehouseType: item.warehouseType || 'goods',
            city: item.city || null,
            region: item.region || null,
            address: item.address || null,
            capacity: item.capacity || null,
            description: item.description || null,
            status: 'active',
          },
        });
        successCount++;
      } catch (error: any) {
        errors.push({
          row: index + 2, // Excel rows start at 1, header is 1, data starts at 2
          errors: [{ field: 'warehouse', message: error.message }],
        });
      }
    }

    logActivity('import', createdBy, 'warehouses', {
      totalImported: successCount,
      totalFailed: errors.length,
    });

    if (errors.length > 0) {
      const errObj: any = new Error('Lỗi import dữ liệu kho');
      errObj.statusCode = 400;
      errObj.importErrors = errors;
      throw errObj;
    }

    return { message: `Đã import thành công ${successCount} kho hàng` };
  }

  async getImportTemplate() {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template');

    worksheet.columns = [
      { header: 'Mã kho (*)', key: 'code', width: 20 },
      { header: 'Tên kho (*)', key: 'name', width: 30 },
      { header: 'Loại kho', key: 'type', width: 20 },
      { header: 'Tỉnh/Thành', key: 'city', width: 20 },
      { header: 'Khu vực', key: 'region', width: 20 },
      { header: 'Địa chỉ chi tiết', key: 'address', width: 40 },
      { header: 'Sức chứa', key: 'capacity', width: 15 },
      { header: 'Mô tả', key: 'note', width: 30 },
    ];

    worksheet.addRow({
      code: 'KHO-TEST01',
      name: 'Kho trung tâm',
      type: 'Thành phẩm',
      city: 'Hồ Chí Minh',
      region: 'Miền Nam',
      address: '123 Đường ABC, Quận 1',
      capacity: 1000,
      note: 'Kho chính',
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F2FF' },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as Buffer;
  }
}

export default new WarehouseService();

