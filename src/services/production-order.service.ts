import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import bomService from './bom.service';
import {
  CreateProductionOrderInput,
  UpdateProductionOrderInput,
  StartProductionInput,
  CompleteProductionInput,
  CancelProductionInput,
  ProductionOrderQueryInput,
} from '@validators/production-order.validator';
const prisma = new PrismaClient();

class ProductionOrderService {
  private async generateOrderCode(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const count = await prisma.productionOrder.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    const sequence = (count + 1).toString().padStart(3, '0');
    return `LSX-${dateStr}-${sequence}`;
  }

  async getAll(query: ProductionOrderQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      status,
      bomId,
      warehouseId,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.ProductionOrderWhereInput = {
      ...(status && { status }),
      ...(bomId && { bomId }),
      ...(warehouseId && { warehouseId }),
      ...(search && {
        OR: [
          { orderCode: { contains: search } },
          { finishedProduct: { productName: { contains: search } } },
        ],
      }),
      ...(fromDate &&
        toDate && {
        startDate: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
      }),
    };

    const [orders, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          bom: {
            select: {
              id: true,
              bomCode: true,
              version: true,
              outputQuantity: true,
            },
          },
          finishedProduct: {
            select: {
              id: true,
              sku: true,
              productName: true,
              unitId: true,
              unit: { select: { unitCode: true, unitName: true } },
            },
          },
          warehouse: {
            select: {
              id: true,
              warehouseName: true,
              warehouseCode: true,
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
          materials: {
            include: {
              material: {
                select: {
                  id: true,
                  productName: true,
                  unitId: true,
                  unit: { select: { unitCode: true, unitName: true } },
                  inventory: {
                    select: {
                      warehouseId: true,
                      quantity: true,
                      reservedQuantity: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              materials: true,
            },
          },
        },
      }),
      prisma.productionOrder.count({ where }),
    ]);

    const enrichedOrders = orders.map((order) => {
      if (order.status !== 'pending') {
        const { materials, ...orderWithoutMaterials } = order;
        return {
          ...orderWithoutMaterials,
          materialAvailability: null,
        };
      }

      const missingItems: any[] = [];
      let isSufficient = true;

      for (const item of order.materials) {
        const requiredQty = Number(item.plannedQuantity);

        const totalAvailable = item.material.inventory.reduce((sum, inv) => {
          const availalble = Number(inv.quantity) - Number(inv.reservedQuantity);

          return sum + (availalble > 0 ? availalble : 0);
        }, 0);

        if (totalAvailable < requiredQty) {
          isSufficient = false;
          missingItems.push({
            materialId: item.materialId,
            materialName: item.material.productName,
            unit: (item.material.unit as any)?.unitCode || '',
            required: requiredQty,
            available: totalAvailable,
            missing: requiredQty - totalAvailable,
          });
        }
      }

      const { materials, ...orderRest } = order;

      return {
        ...orderRest,
        materialAvailability: {
          status: isSufficient ? 'sufficient' : 'insufficient',
          missingItems: missingItems,
        },
      };
    });

    const result = {
      data: enrichedOrders,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      message: 'Lấy danh sách lệnh sản xuất thành công',
    };

    return result;
  }

  async getById(id: number) {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        bom: {
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
                    unit: { select: { unitCode: true, unitName: true } },
                    purchasePrice: true,
                  },
                },
              },
            },
          },
        },
        finishedProduct: {
          select: {
            id: true,
            sku: true,
            productName: true,
            productType: true,
            unitId: true,
            unit: { select: { unitCode: true, unitName: true } },
          },
        },
        warehouse: true,
        materials: {
          include: {
            material: {
              include: {
                inventory: {
                  select: {
                    warehouseId: true,
                    quantity: true,
                    reservedQuantity: true,
                  },
                },
              },
            },
            stockTransaction: {
              select: {
                id: true,
                transactionCode: true,
                status: true,
              },
            },
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
        canceller: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy lệnh sản xuất');
    }

    // Bổ sung nguyên liệu với số lượng hiện tại từ kho.
    let enrichedOrder = order;
    if (order.materials.length > 0) {
      const enrichedMaterials = await Promise.all(
        order.materials.map(async (material) => {
          const totalAvailable = material.material.inventory.reduce((sum: number, inv: any) => {
            const available = Number(inv.quantity) - Number(inv.reservedQuantity);
            return sum + (available > 0 ? available : 0);
          }, 0);

          // Xóa mảng hàng tồn kho khỏi phản hồi, chỉ giữ lại currentQuantity.
          const { inventory, ...materialWithoutInventory } = material.material as any;

          return {
            ...material,
            material: {
              ...materialWithoutInventory,
              currentQuantity: totalAvailable,
            } as any,
          };
        })
      );

      enrichedOrder = {
        ...order,
        materials: enrichedMaterials as any,
      };
    }

    // Tính toán lượng nguyên vật liệu thiếu hụt cho các đơn hàng đang chờ xử lý
    let shortages: any[] = [];
    if (enrichedOrder.status === 'pending') {
      for (const item of enrichedOrder.materials) {
        const requiredQty = Number(item.plannedQuantity);
        const material = item.material as any;
        const currentQty = Number(material.currentQuantity || 0);

        if (currentQty < requiredQty) {
          shortages.push({
            materialId: item.materialId,
            materialName: material.productName,
            materialType: item.materialType,
            required: requiredQty,
            available: currentQty,
            shortage: requiredQty - currentQty,
            unit: material.unit,
          });
        }
      }
    }

    // Xây dựng phương án ứng phó khi thiếu hụt nguồn cung.
    const responseData = {
      ...enrichedOrder,
      shortages,
    };

    return responseData;
  }

  async create(data: CreateProductionOrderInput, userId: number) {
    const bom = await bomService.getById(data.bomId);
    if (!bom) {
      throw new NotFoundError('Không tìm thấy BOM');
    }

    if (bom.status !== 'active') {
      throw new ValidationError('BOM phải là trạng thái active để tạo đơn sản xuất');
    }

    if (data.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: data.warehouseId },
      });

      if (!warehouse) {
        throw new NotFoundError('Không tìm thấy kho');
      }

      if (warehouse.status !== 'active') {
        throw new ValidationError('Kho phải là trạng thái active để tạo đơn sản xuất');
      }

      if (warehouse.warehouseType !== 'finished_product') {
        throw new ValidationError('Kho không phù hợp. Vui lòng chọn kho thành phẩm.');
      }
    }

    const materialCalculation = await bomService.calculateMaterials({
      bomId: data.bomId,
      productionQuantity: data.plannedQuantity,
    });

    const orderCode = await this.generateOrderCode();

    const productionOrder = await prisma.productionOrder.create({
      data: {
        orderCode,
        bomId: data.bomId,
        finishedProductId: bom.finishedProductId,
        warehouseId: data.warehouseId,
        plannedQuantity: data.plannedQuantity,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        notes: data.notes,
        status: 'pending',
        createdBy: userId,
        materials: {
          create: materialCalculation.data.materials.map((mat) => ({
            materialId: mat.materialId,
            plannedQuantity: mat.totalQuantityNeeded,
            unitPrice: mat.unitPrice,
            materialType: mat.materialType,
            notes: mat.notes,
          })),
        },
      },
      include: {
        bom: true,
        finishedProduct: true,
        warehouse: true,
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
      },
    });

    // Làm giàu vật liệu với số lượng hiện tại
    const enrichedProductionOrder = {
      ...productionOrder,
      materials: productionOrder.materials.map((material) => {
        const totalAvailable = material.material.inventory.reduce((sum: number, inv: any) => {
          const available = Number(inv.quantity) - Number(inv.reservedQuantity);
          return sum + (available > 0 ? available : 0);
        }, 0);

        return {
          ...material,
          material: {
            id: material.material.id,
            sku: material.material.sku,
            productName: material.material.productName,
            productType: material.material.productType,
            unitId: (material.material as any).unitId,
            unit: (material.material as any).unit,
            purchasePrice: material.material.purchasePrice,
            currentQuantity: totalAvailable,
          } as any,
        };
      }) as any,
    };

    logActivity('create', userId, 'production_orders', {
      recordId: enrichedProductionOrder.id,
      orderCode: enrichedProductionOrder.orderCode,
    });

    return enrichedProductionOrder as any;
  }

  async update(id: number, data: UpdateProductionOrderInput, userId: number) {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundError('Lệnh sản xuất không tồn tại');
    }

    if (order.status !== 'pending') {
      throw new ValidationError('Chỉ có thể cập nhật lệnh sản xuất ở trạng thái pending');
    }

    const updatedOrder = await prisma.productionOrder.update({
      where: { id },
      data: {
        ...(data.plannedQuantity && { plannedQuantity: data.plannedQuantity }),
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        bom: true,
        finishedProduct: true,
        warehouse: true,
        materials: {
          include: {
            material: true,
          },
        },
      },
    });

    logActivity('update', userId, 'production_orders', {
      recordId: id,
      orderCode: order.orderCode,
      changes: data,
    });

    return updatedOrder;
  }

  async start(id: number, userId: number, data?: StartProductionInput) {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        materials: {
          include: {
            material: true,
          },
        },
        bom: true,
        warehouse: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Lệnh sản xuất không tồn tại');
    }

    if (order.status !== 'pending') {
      throw new ValidationError('Chỉ có thể bắt đầu lệnh sản xuất ở trạng thái pending');
    }

    // BƯỚC 1: Kiểm tra lại lần nữa - Xác minh tất cả các vật liệu đều có sẵn.
    const materialAvailability: Array<{
      material: any;
      required: number;
      available: number;
      warehouseId: number;
    }> = [];

    for (const material of order.materials) {
      const warehouseType = material.materialType === 'raw_material' ? 'raw_material' : 'packaging';

      const inventoryRecord = await prisma.inventory.findFirst({
        where: {
          productId: material.materialId,
          warehouse: {
            warehouseType,
            status: 'active',
          },
          quantity: {
            gte: material.plannedQuantity,
          },
        },
        include: {
          warehouse: true,
        },
      });

      if (!inventoryRecord) {
        // Tính toán số lượng thực tế có sẵn cho thông báo lỗi.
        const totalAvailable = await prisma.inventory.aggregate({
          where: {
            productId: material.materialId,
            warehouse: {
              warehouseType,
              status: 'active',
            },
          },
          _sum: {
            quantity: true,
            reservedQuantity: true,
          },
        });

        const available = Math.max(
          0,
          (Number(totalAvailable._sum.quantity) || 0) -
          (Number(totalAvailable._sum.reservedQuantity) || 0)
        );

        throw new ValidationError(
          `Không đủ tồn kho cho nguyên liệu "${material.material.productName}". ` +
          `Cần: ${Number(material.plannedQuantity)}, Có: ${available}`
        );
      }

      materialAvailability.push({
        material,
        required: Number(material.plannedQuantity),
        available: Number(inventoryRecord.quantity),
        warehouseId: inventoryRecord.warehouseId,
      });
    }

    const stockTransactionCode = `PXK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now() % 1000
      }`;

    // BƯỚC 2, 3, 4: Thực hiện giao dịch
    const result = await prisma.$transaction(async (tx) => {
      // BƯỚC 1: Tính tổng giá trị giao dịch trước khi tạo
      const totalValue = materialAvailability.reduce((sum, matAvail) => {
        const cost = Number(matAvail.material.plannedQuantity) * Number(matAvail.material.unitPrice);
        return sum + cost;
      }, 0);

      // BƯỚC 2: Create stock transaction header with total_value
      const stockTransaction = await tx.stockTransaction.create({
        data: {
          transactionCode: stockTransactionCode,
          transactionType: 'export',
          warehouseId: materialAvailability[0]?.warehouseId || 1,
          referenceType: 'production_order',
          referenceId: id,
          reason: `Export materials for production order ${order.orderCode}`,
          totalValue,
          status: 'approved',
          createdBy: userId,
          approvedBy: userId,
          approvedAt: new Date(),
        },
      });

      // BƯỚC 3: Gia công từng vật liệu
      for (const matAvail of materialAvailability) {
        const material = matAvail.material;
        const inventoryId = (
          await tx.inventory.findFirst({
            where: {
              productId: material.materialId,
              warehouseId: matAvail.warehouseId,
              quantity: {
                gte: material.plannedQuantity,
              },
            },
            select: { id: true },
          })
        )?.id;

        if (!inventoryId) {
          throw new ValidationError(
            `Lỗi: Không tìm thấy tồn kho cho nguyên liệu "${material.material.productName}"`
          );
        }

        // BƯỚC 3A: Khấu trừ hàng tồn kho
        await tx.inventory.update({
          where: { id: inventoryId },
          data: {
            quantity: {
              decrement: material.plannedQuantity,
            },
            updatedBy: userId,
          },
        });

        // BƯỚC 3B: Tạo chi tiết giao dịch với warehouseId
        await tx.stockTransactionDetail.create({
          data: {
            transactionId: stockTransaction.id,
            productId: material.materialId,
            warehouseId: matAvail.warehouseId,
            quantity: material.plannedQuantity,
            unitPrice: material.unitPrice,
          },
        });

        // BƯỚC 3C: Cập nhật production_order_materials - Khóa actualQuantity & unitPrice
        await tx.productionOrderMaterial.update({
          where: { id: material.id },
          data: {
            actualQuantity: material.plannedQuantity,
            unitPrice: material.unitPrice, // ✅ Khóa giá hiện tại
            stockTransactionId: stockTransaction.id,
          },
        });
      }

      // BƯỚC 4: Cập nhật trạng thái đơn đặt hàng sản xuất và ngày bắt đầu
      const updatedOrder = await tx.productionOrder.update({
        where: { id },
        data: {
          status: 'in_progress',
          startDate: new Date(), // ✅ Cập nhật đến thời điểm hiện tại
          approvedBy: userId,
          approvedAt: new Date(),
          notes: data?.notes ? `${order.notes || ''}\n${data.notes}` : order.notes,
        },
        include: {
          bom: true,
          finishedProduct: true,
          warehouse: true,
          materials: {
            include: {
              material: true,
              stockTransaction: true,
            },
          },
        },
      });

      return { order: updatedOrder, stockTransaction };
    });

    logActivity('update', userId, 'production_orders', {
      recordId: id,
      action: 'start_production',
      orderCode: order.orderCode,
      materialCount: materialAvailability.length,
    });

    return result;
  }

  async complete(id: number, userId: number, data: CompleteProductionInput) {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        materials: {
          include: {
            material: true,
          },
        },
        finishedProduct: true,
        warehouse: true,
        bom: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Lệnh sản xuất không tìm thấy');
    }

    if (order.status !== 'in_progress') {
      throw new ValidationError(
        'Chỉ có thể hoàn thành các đơn đặt hàng sản xuất có trạng thái (in_progress).'
      );
    }

    if (!order.warehouseId) {
      throw new ValidationError('Cần phải chỉ định kho hàng để hoàn tất đơn đặt hàng sản xuất.');
    }

    let totalWastage = 0;
    if (data.materials) {
      for (const materialInput of data.materials) {
        const plannedMaterial = order.materials.find(
          (m) => m.materialId === materialInput.materialId
        );
        if (plannedMaterial && materialInput.actualQuantity !== undefined) {
          const wastage =
            materialInput.wastage !== undefined
              ? materialInput.wastage
              : materialInput.actualQuantity - Number(plannedMaterial.plannedQuantity);
          totalWastage += wastage;
        }
      }
    }

    const stockTransactionCode = `PNK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now() % 1000
      }`;

    const result = await prisma.$transaction(async (tx) => {
      // BƯỚC 1: Tính tổng chi phí vật liệu dự kiến (trước khi update)
      const preliminaryMaterialCost = order.materials.reduce((sum, mat) => {
        return sum + Number(mat.plannedQuantity) * Number(mat.unitPrice);
      }, 0);

      // Tạo stock transaction header với totalValue tạm tính
      const stockTransaction = await tx.stockTransaction.create({
        data: {
          transactionCode: stockTransactionCode,
          transactionType: 'import',
          warehouseId: order.warehouseId!,
          referenceType: 'production_order',
          referenceId: id,
          reason: `Nhập khẩu thành phẩm theo đơn đặt hàng sản xuất ${order.orderCode}`,
          totalValue: preliminaryMaterialCost, // Tạm tính, sẽ update lại sau
          status: 'approved',
          createdBy: userId,
          approvedBy: userId,
          approvedAt: new Date(),
          details: {
            create: {
              productId: order.finishedProductId,
              quantity: data.actualQuantity,
              unitPrice: 0, // Tạm thời, sẽ update lại sau khi tính chi phí
              warehouseId: order.warehouseId!,
            },
          },
        },
      });

      const existingInventory = await tx.inventory.findFirst({
        where: {
          warehouseId: order.warehouseId!,
          productId: order.finishedProductId,
        },
      });

      if (existingInventory) {
        await tx.inventory.update({
          where: { id: existingInventory.id },
          data: {
            quantity: {
              increment: data.actualQuantity,
            },
            updatedBy: userId,
          },
        });
      } else {
        await tx.inventory.create({
          data: {
            warehouseId: order.warehouseId!,
            productId: order.finishedProductId,
            quantity: data.actualQuantity,
            reservedQuantity: 0,
            updatedBy: userId,
          },
        });
      }

      if (data.materials) {
        for (const materialInput of data.materials) {
          const originalMaterial = order.materials.find(
            (m) => m.materialId === materialInput.materialId
          );

          if (!originalMaterial) continue;

          // Chỉ xử lý nếu user nhập actualQuantity
          if (materialInput.actualQuantity === undefined) {
            continue;
          }

          // BƯỚC 1A: Tính toán chênh lệch số lượng
          const quantityDifference =
            Number(materialInput.actualQuantity) - Number(originalMaterial.plannedQuantity);

          // BƯỚC 1B: Nếu thực tế > kế hoạch, cần trừ thêm từ kho
          if (quantityDifference > 0) {
            // Lấy materialType từ originalMaterial (có sẵn từ start)
            const warehouseType =
              originalMaterial.materialType === 'raw_material' ? 'raw_material' : 'packaging';

            // Tìm tồn kho của nguyên liệu này
            const inventoryRecord = await tx.inventory.findFirst({
              where: {
                productId: materialInput.materialId,
                warehouse: {
                  warehouseType,
                  status: 'active',
                },
              },
            });

            if (!inventoryRecord) {
              throw new ValidationError(
                `Không tìm thấy tồn kho cho nguyên liệu ID ${materialInput.materialId}`
              );
            }

            // Kiểm tra xem kho có đủ để trừ thêm không
            if (Number(inventoryRecord.quantity) < quantityDifference) {
              throw new ValidationError(
                `Không đủ tồn kho để trừ thêm ${quantityDifference} ` +
                `cho nguyên liệu ID ${materialInput.materialId}. ` +
                `Hiện có: ${inventoryRecord.quantity}`
              );
            }

            // Trừ thêm số lượng từ kho
            await tx.inventory.update({
              where: { id: inventoryRecord.id },
              data: {
                quantity: {
                  decrement: quantityDifference,
                },
                updatedBy: userId,
              },
            });
          }

          // BƯỚC 1C: Cập nhật actualQuantity và wastage
          await tx.productionOrderMaterial.updateMany({
            where: {
              productionOrderId: id,
              materialId: materialInput.materialId,
            },
            data: {
              actualQuantity: materialInput.actualQuantity,
              wastage: materialInput.wastage || 0,
              notes: materialInput.notes,
            },
          });
        }
      }

      // BƯỚC 2: Tính toán giá thành chính xác (sau khi cập nhật)
      // Re-fetch materials với actualQuantity mới nhất
      const updatedMaterials = await tx.productionOrderMaterial.findMany({
        where: { productionOrderId: id },
        include: {
          material: true,
        },
      });

      const totalCost = updatedMaterials.reduce((sum, mat) => {
        return sum + Number(mat.actualQuantity) * Number(mat.unitPrice);
      }, 0);

      // Tính unit price cho thành phẩm
      const finishedProductUnitPrice = data.actualQuantity > 0 ? totalCost / data.actualQuantity : 0;

      // Cập nhật stock transaction với tổng chi phí chính xác
      await tx.stockTransaction.update({
        where: { id: stockTransaction.id },
        data: {
          totalValue: totalCost,
        },
      });

      // Cập nhật stock transaction detail với unit price chính xác
      await tx.stockTransactionDetail.updateMany({
        where: { transactionId: stockTransaction.id },
        data: {
          unitPrice: finishedProductUnitPrice,
        },
      });

      const updatedOrder = await tx.productionOrder.update({
        where: { id },
        data: {
          status: 'completed',
          actualQuantity: data.actualQuantity,
          productionCost: totalCost,
          completedAt: new Date(),
          endDate: new Date(),
          notes: data.notes ? `${order.notes || ''}\n${data.notes}` : order.notes,
        },
        include: {
          bom: true,
          finishedProduct: true,
          warehouse: true,
          materials: {
            include: {
              material: true,
              stockTransaction: true,
            },
          },
        },
      });

      return { order: updatedOrder, stockTransaction, totalWastage };
    });

    logActivity('update', userId, 'production_orders', {
      recordId: id,
      action: 'complete_production',
      orderCode: order.orderCode,
      actualQuantity: data.actualQuantity,
      wastage: result.totalWastage,
    });

    return result;
  }

  async cancel(id: number, userId: number, data: CancelProductionInput) {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        materials: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Production order not found');
    }

    if (order.status === 'completed') {
      throw new ValidationError('Cannot cancel completed production order');
    }

    if (order.status === 'cancelled') {
      throw new ValidationError('Production order is already cancelled');
    }

    let materialRollback = null;
    if (order.status === 'in_progress') {
      // TODO: Implement material rollback logic if needed
      // For now, we'll just mark as cancelled
      materialRollback = {
        message: 'Material rollback should be handled manually',
        materials: order.materials.map((m) => ({
          materialId: m.materialId,
          actualQuantity: Number(m.actualQuantity),
        })),
      };
    }

    const updatedOrder = await prisma.productionOrder.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledBy: userId,
        cancelledAt: new Date(),
        notes: `${order.notes || ''}\n[CANCELLED] ${data.reason}`,
      },
      include: {
        bom: true,
        finishedProduct: true,
        warehouse: true,
        materials: {
          include: {
            material: true,
          },
        },
        canceller: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    logActivity('update', userId, 'production_orders', {
      recordId: id,
      action: 'cancel_production',
      orderCode: order.orderCode,
      reason: data.reason,
    });

    return {
      order: updatedOrder,
      materialRollback,
    };
  }

  async getWastageReport(id: number) {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        materials: {
          include: {
            material: {
              select: {
                id: true,
                sku: true,
                productName: true,
                unit: true,
                purchasePrice: true,
              },
            },
          },
        },
        finishedProduct: true,
        bom: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Production order not found');
    }

    const wastageDetails = order.materials.map((mat) => {
      const wastageAmount = Number(mat.wastage);
      const wastagePercentage =
        Number(mat.plannedQuantity) > 0 ? (wastageAmount / Number(mat.plannedQuantity)) * 100 : 0;
      const wastageCost = wastageAmount * Number(mat.unitPrice);

      return {
        materialId: mat.materialId,
        materialName: mat.material.productName,
        materialSku: mat.material.sku,
        materialType: mat.materialType,
        plannedQuantity: Number(mat.plannedQuantity),
        actualQuantity: Number(mat.actualQuantity),
        wastageAmount,
        wastagePercentage: Math.round(wastagePercentage * 100) / 100,
        unitPrice: Number(mat.unitPrice),
        wastageCost: Math.round(wastageCost * 100) / 100,
        unit: mat.material.unit,
      };
    });

    const totalWastageCost = wastageDetails.reduce((sum, w) => sum + w.wastageCost, 0);

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      finishedProduct: {
        name: order.finishedProduct.productName,
        plannedQuantity: Number(order.plannedQuantity),
        actualQuantity: Number(order.actualQuantity),
      },
      efficiencyRate: Number(order.bom.efficiencyRate),
      wastageDetails,
      totalWastageCost: Math.round(totalWastageCost * 100) / 100,
      productionCost: Number(order.productionCost),
    };
  }

  async delete(id: number, userId: number) {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundError('Production order not found');
    }

    if (order.status !== 'pending') {
      throw new ValidationError('Can only delete production orders with pending status');
    }

    await prisma.productionOrder.delete({
      where: { id },
    });

    logActivity('delete', userId, 'production_orders', {
      recordId: id,
      orderCode: order.orderCode,
    });

    return { message: 'Production order deleted successfully' };
  }
}

export default new ProductionOrderService();
