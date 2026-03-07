import { PrismaClient, Prisma, ProductType } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
  CreateBomInput,
  UpdateBomInput,
  BomQueryInput,
  CalculateMaterialsInput,
} from '@validators/bom.validator';

const prisma = new PrismaClient();

class BomService {
  async getAll(query: BomQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      status,
      finishedProductId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.BomWhereInput = {
      ...(status && { status }),
      ...(finishedProductId && { finishedProductId }),
      ...(search && {
        OR: [
          { bomCode: { contains: search } },
          { finishedProduct: { productName: { contains: search } } },
        ],
      }),
    };

    const [boms, total] = await Promise.all([
      prisma.bom.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          finishedProduct: {
            select: {
              id: true,
              sku: true,
              productName: true,
              productType: true,
              unitId: true,
              unit: { select: { id: true, unitCode: true, unitName: true } },
            },
          },
          materials: {
            include: {
              material: {
                select: {
                  id: true,
                  sku: true,
                  productName: true,
                  productType: true,
                  unit: true,
                },
              },
            },
          },
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
          approver: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
        },
      }),
      prisma.bom.count({ where }),
    ]);

    const result = {
      data: boms,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      message: 'Lấy danh sách BOM thành công',
    };

    return result;
  }

  async getById(id: number) {

    const bom = await prisma.bom.findUnique({
      where: { id },
      include: {
        finishedProduct: {
          select: {
            id: true,
            sku: true,
            productName: true,
            productType: true,
            unitId: true,
            unit: { select: { id: true, unitCode: true, unitName: true } },
            sellingPriceRetail: true,
          },
        },
        materials: {
          include: {
            material: {
              select: {
                id: true,
                sku: true,
                productName: true,
                productType: true,
                packagingType: true,
                unitId: true,
                unit: { select: { id: true, unitCode: true, unitName: true } },
                purchasePrice: true,
              },
            },
          },
          orderBy: {
            materialType: 'asc',
          },
        },
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            email: true,
          },
        },
        productionOrders: {
          select: {
            id: true,
            orderCode: true,
            status: true,
            plannedQuantity: true,
            actualQuantity: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
      },
    });

    if (!bom) {
      throw new NotFoundError('Không tìm thấy BOM');
    }

    return bom;
  }

  async create(data: CreateBomInput, userId: number) {
    const existingBom = await prisma.bom.findUnique({
      where: { bomCode: data.bomCode },
    });

    if (existingBom) {
      throw new ConflictError('Mã BOM đã tồn tại');
    }

    const finishedProduct = await prisma.product.findUnique({
      where: { id: data.finishedProductId },
    });

    if (!finishedProduct) {
      throw new NotFoundError('Không tìm thấy thành phẩm');
    }

    if (finishedProduct.productType !== ProductType.finished_product) {
      throw new ValidationError('Sản phẩm phải thuộc loại thành phẩm');
    }

    if (finishedProduct.status !== 'active') {
      throw new ValidationError('Sản phẩm phải đang hoạt động');
    }

    const materialIds = data.materials.map((m) => m.materialId);
    const materials = await prisma.product.findMany({
      where: { id: { in: materialIds } },
    });

    if (materials.length !== materialIds.length) {
      throw new NotFoundError('Không tìm thấy một hoặc nhiều nguyên liệu');
    }

    for (const materialInput of data.materials) {
      const material = materials.find((m) => m.id === materialInput.materialId);
      if (!material) continue;

      if (
        materialInput.materialType === 'raw_material' &&
        material.productType !== ProductType.raw_material
      ) {
        throw new ValidationError(
          `Nguyên liệu "${material.productName}" phải thuộc loại nguyên liệu thô`
        );
      }

      if (
        materialInput.materialType === 'packaging' &&
        material.productType !== ProductType.packaging
      ) {
        throw new ValidationError(`Nguyên liệu "${material.productName}" phải thuộc loại bao bì`);
      }

      if (material.status !== 'active') {
        throw new ValidationError(`Nguyên liệu "${material.productName}" phải đang hoạt động`);
      }
    }

    const bom = await prisma.bom.create({
      data: {
        bomCode: data.bomCode,
        finishedProductId: data.finishedProductId,
        version: data.version || '1.0',
        outputQuantity: data.outputQuantity,
        efficiencyRate: data.efficiencyRate || 100,
        productionTime: data.productionTime,
        notes: data.notes,
        status: 'draft',
        createdBy: userId,
        materials: {
          create: data.materials.map((m) => ({
            materialId: m.materialId,
            quantity: m.quantity,
            unit: m.unit,
            materialType: m.materialType,
            notes: m.notes,
          })),
        },
      },
      include: {
        finishedProduct: true,
        materials: {
          include: {
            material: true,
          },
        },
      },
    });

    logActivity('create', userId, 'bom', {
      recordId: bom.id,
      bomCode: bom.bomCode,
    });

    return bom;
  }

  async update(id: number, data: UpdateBomInput, userId: number) {
    const bom = await prisma.bom.findUnique({
      where: { id },
      include: { materials: true },
    });

    if (!bom) {
      throw new NotFoundError('Không tìm thấy BOM');
    }

    if (bom.status === 'active') {
      throw new ValidationError(
        'Không thể cập nhật BOM đang hoạt động. Vui lòng tạo phiên bản mới.'
      );
    }

    if (data.bomCode && data.bomCode !== bom.bomCode) {
      const existingBom = await prisma.bom.findUnique({
        where: { bomCode: data.bomCode },
      });

      if (existingBom) {
        throw new ConflictError('Mã BOM đã tồn tại');
      }
    }

    if (data.finishedProductId && data.finishedProductId !== bom.finishedProductId) {
      const finishedProduct = await prisma.product.findUnique({
        where: { id: data.finishedProductId },
      });

      if (!finishedProduct) {
        throw new NotFoundError('Không tìm thấy thành phẩm');
      }

      if (finishedProduct.productType !== ProductType.finished_product) {
        throw new ValidationError('Sản phẩm phải thuộc loại thành phẩm');
      }
    }

    if (data.materials) {
      const materialIds = data.materials.map((m) => m.materialId);
      const materials = await prisma.product.findMany({
        where: { id: { in: materialIds } },
      });

      if (materials.length !== materialIds.length) {
        throw new NotFoundError('Không tìm thấy một hoặc nhiều nguyên liệu');
      }

      for (const materialInput of data.materials) {
        const material = materials.find((m) => m.id === materialInput.materialId);
        if (!material) continue;

        if (
          materialInput.materialType === 'raw_material' &&
          material.productType !== ProductType.raw_material
        ) {
          throw new ValidationError(
            `Nguyên liệu "${material.productName}" phải thuộc loại nguyên liệu thô`
          );
        }

        if (
          materialInput.materialType === 'packaging' &&
          material.productType !== ProductType.packaging
        ) {
          throw new ValidationError(`Nguyên liệu "${material.productName}" phải thuộc loại bao bì`);
        }
      }
    }

    const updatedBom = await prisma.bom.update({
      where: { id },
      data: {
        ...(data.bomCode && { bomCode: data.bomCode }),
        ...(data.finishedProductId && { finishedProductId: data.finishedProductId }),
        ...(data.version && { version: data.version }),
        ...(data.outputQuantity && { outputQuantity: data.outputQuantity }),
        ...(data.efficiencyRate !== undefined && { efficiencyRate: data.efficiencyRate }),
        ...(data.productionTime !== undefined && { productionTime: data.productionTime }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.materials && {
          materials: {
            deleteMany: {},
            create: data.materials.map((m) => ({
              materialId: m.materialId,
              quantity: m.quantity,
              unit: m.unit,
              materialType: m.materialType,
              notes: m.notes,
            })),
          },
        }),
      },
      include: {
        finishedProduct: true,
        materials: {
          include: {
            material: true,
          },
        },
      },
    });

    logActivity('update', userId, 'bom', {
      recordId: id,
      bomCode: updatedBom.bomCode,
      changes: data,
    });

    return updatedBom;
  }

  async delete(id: number, userId: number) {
    const bom = await prisma.bom.findUnique({
      where: { id },
      include: {
        productionOrders: true,
      },
    });

    if (!bom) {
      throw new NotFoundError('Không tìm thấy BOM');
    }

    if (bom.productionOrders.length > 0) {
      throw new ValidationError(
        'Không thể xóa BOM đã có đơn hàng sản xuất. Vui lòng đặt trạng thái thành không hoạt động.'
      );
    }

    if (bom.status === 'active') {
      throw new ValidationError(
        'Không thể xóa BOM đang hoạt động. Vui lòng đặt trạng thái thành không hoạt động.'
      );
    }

    await prisma.bom.delete({
      where: { id },
    });

    logActivity('delete', userId, 'bom', {
      recordId: id,
      bomCode: bom.bomCode,
    });

    return { message: 'Xóa BOM thành công' };
  }

  async approve(id: number, userId: number, notes?: string) {
    const bom = await prisma.bom.findUnique({
      where: { id },
      include: {
        materials: true,
        finishedProduct: true,
      },
    });

    if (!bom) {
      throw new NotFoundError('Không tìm thấy BOM');
    }

    if (bom.status === 'active') {
      throw new ValidationError('BOM đã được phê duyệt');
    }

    if (bom.materials.length === 0) {
      throw new ValidationError('Không thể phê duyệt BOM khi chưa có nguyên liệu');
    }

    const updatedBom = await prisma.bom.update({
      where: { id },
      data: {
        status: 'active',
        approvedBy: userId,
        approvedAt: new Date(),
        ...(notes && { notes }),
      },
      include: {
        finishedProduct: true,
        materials: {
          include: {
            material: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    logActivity('approve', userId, 'bom', {
      recordId: id,
      bomCode: bom.bomCode,
      notes,
    });

    return updatedBom;
  }

  async calculateMaterials(params: CalculateMaterialsInput) {
    const { bomId, productionQuantity } = params;
    const materialShortages: Array<{
      materialId: number;
      materialName: string;
      materialSku: string;
      required: number;
      available: number;
      shortage: number;
    }> = [];

    const bom = await prisma.bom.findUnique({
      where: { id: bomId },
      include: {
        materials: {
          include: {
            material: {
              include: {
                inventory: {
                  select: {
                    quantity: true,
                    reservedQuantity: true,
                  },
                },
              },
            },
          },
        },
        finishedProduct: {
          select: {
            id: true,
            productName: true,
            unitId: true,
            unit: { select: { id: true, unitCode: true, unitName: true } },
          },
        },
      },
    });

    if (!bom) {
      throw new NotFoundError('Không tìm thấy BOM');
    }

    const batchCount = productionQuantity / Number(bom.outputQuantity);

    const materialsNeeded = bom.materials.map((bomMaterial) => {
      const baseQuantity = Number(bomMaterial.quantity) * batchCount;

      const adjustedQuantity = baseQuantity * (100 / Number(bom.efficiencyRate));
      const estimatedCost = adjustedQuantity * (Number(bomMaterial.material.purchasePrice) || 0);

      // Tính số lượng hệ thống trong kho
      const currentQuantity = bomMaterial.material.inventory.reduce((sum: number, inv: any) => {
        const available = Number(inv.quantity) - Number(inv.reservedQuantity);
        return sum + (available > 0 ? available : 0);
      }, 0);

      return {
        materialId: bomMaterial.materialId,
        materialName: bomMaterial.material.productName,
        materialSku: bomMaterial.material.sku,
        materialType: bomMaterial.materialType,
        unit: bomMaterial.unit || (bomMaterial.material as any).unit?.unitCode || '',
        baseQuantityPerBatch: Number(bomMaterial.quantity),
        totalQuantityNeeded: Math.ceil(adjustedQuantity * 100) / 100,
        currentQuantity: currentQuantity, // Added: Available quantity in warehouse
        unitPrice: Number(bomMaterial.material.purchasePrice) || 0,
        estimatedCost: Math.ceil(estimatedCost * 100) / 100,
        notes: bomMaterial.notes,
      };
    });

    // Kiểm tra thiếu hụt tồn kho
    for (const material of materialsNeeded) {
      const warehouseType = material.materialType === 'raw_material' ? 'raw_material' : 'packaging';

      const inventoryRecords = await prisma.inventory.findMany({
        where: {
          productId: material.materialId,
          warehouse: {
            warehouseType,
            status: 'active',
          },
        },
      });

      const totalAvailable = inventoryRecords.reduce(
        (sum, inv) => sum + (Number(inv.quantity) - Number(inv.reservedQuantity)),
        0
      );

      if (totalAvailable < material.totalQuantityNeeded) {
        materialShortages.push({
          materialId: material.materialId,
          materialName: material.materialName,
          materialSku: material.materialSku,
          required: material.totalQuantityNeeded,
          available: Math.max(0, totalAvailable),
          shortage: material.totalQuantityNeeded - totalAvailable,
        });
      }
    }

    const totalCost = materialsNeeded.reduce((sum, m) => sum + m.estimatedCost, 0);

    const result = {
      data: {
        bomId: bom.id,
        bomCode: bom.bomCode,
        finishedProduct: {
          id: bom.finishedProduct.id,
          name: bom.finishedProduct.productName,
          unit: (bom.finishedProduct.unit as any)?.unitName || '',
        },
        productionQuantity,
        outputQuantityPerBatch: Number(bom.outputQuantity),
        batchCount: Math.ceil(batchCount * 100) / 100,
        efficiencyRate: Number(bom.efficiencyRate),
        materials: materialsNeeded,
        totalEstimatedCost: Math.ceil(totalCost * 100) / 100,
        costPerUnit:
          productionQuantity > 0 ? Math.ceil((totalCost / productionQuantity) * 100) / 100 : 0,
        shortages: materialShortages,
        hasShortages: materialShortages.length > 0,
      },
      message: 'Tính toán nguyên liệu thành công',
    };

    return result;
  }

  async getByFinishedProduct(finishedProductId: number) {
    const boms = await prisma.bom.findMany({
      where: {
        finishedProductId,
        status: 'active',
      },
      include: {
        materials: {
          include: {
            material: {
              select: {
                id: true,
                sku: true,
                productName: true,
                productType: true,
                unitId: true,
                unit: { select: { id: true, unitCode: true, unitName: true } },
              },
            },
          },
        },
      },
      orderBy: {
        version: 'desc',
      },
    });

    return boms;
  }

  async setInactive(id: number, userId: number, reason?: string) {
    const bom = await prisma.bom.findUnique({
      where: { id },
    });

    if (!bom) {
      throw new NotFoundError('Không tìm thấy BOM');
    }

    const updatedBom = await prisma.bom.update({
      where: { id },
      data: {
        status: 'inactive',
        notes: reason ? `${bom.notes || ''}\n[Inactive] ${reason}` : bom.notes,
      },
    });

    logActivity('update', userId, 'bom', {
      recordId: id,
      action: 'set_inactive',
      reason,
    });

    return updatedBom;
  }
}

export default new BomService();
