import { ApplyPromotionResult, PromotionConditions } from '@custom-types/promotion.type';
import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
  CreatePromotionInput,
  UpdatePromotionInput,
  ApplyPromotionInput,
  PromotionQueryInput,
} from '@validators/promotion.validator';

const prisma = new PrismaClient();

class PromotionService {
  async getAll(query: PromotionQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      promotionType,
      status,
      applicableTo,
      startDate,
      endDate,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    console.log("aaaaaaa")

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    console.log(`❌ Truy vấn từ database...`);

    const where: Prisma.PromotionWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [{ promotionCode: { contains: search } }, { promotionName: { contains: search } }],
      }),
      ...(promotionType && { promotionType }),
      ...(status && { status }),
      ...(applicableTo && { applicableTo }),
      ...(startDate &&
        endDate && {
        OR: [
          {
            startDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
          {
            endDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        ],
      }),
      ...(isActive === 'true' && {
        status: { notIn: ['cancelled', 'expired'] },
        endDate: { gte: new Date() },
      }),
    };

    const [promotions, total, allPromotions] = await Promise.all([
      prisma.promotion.findMany({
        where,
        include: {
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
          products: true,
          _count: {
            select: {
              products: true,
            },
          },
        },
        skip: offset,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.promotion.count({ where }),
      prisma.promotion.findMany({
        where,
        select: {
          id: true,
          status: true,
          usageCount: true,
          startDate: true,
          endDate: true,
        },
      }),
    ]);

    // Calculate statistics
    const now = new Date();
    const threeSevenDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const activePromotions = allPromotions.filter((p: any) => p.status === 'active').length;
    const pendingPromotions = allPromotions.filter((p: any) => p.status === 'pending').length;
    const expiredPromotions = allPromotions.filter((p: any) => p.status === 'expired').length;
    const expiringPromotions = allPromotions.filter(
      (p: any) =>
        p.status === 'active' && p.endDate >= threeSevenDaysLater && p.endDate <= sevenDaysLater
    ).length;

    const totalUsage = allPromotions.reduce((sum: number, p: any) => sum + p.usageCount, 0);

    // Calculate usage by day (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const usageByDayMap: Record<string, number> = {};

    allPromotions.forEach((p: any) => {
      if (p.createdAt >= thirtyDaysAgo) {
        const dateKey = new Date(p.createdAt).toISOString().split('T')[0];
        usageByDayMap[dateKey] = (usageByDayMap[dateKey] || 0) + p.usageCount;
      }
    });

    const usageByDay = Object.entries(usageByDayMap).map(([date, count]) => ({
      date,
      count,
    }));

    const statistics = {
      totalPromotions: total,
      activePromotions,
      pendingPromotions,
      expiredPromotions,
      expiringPromotions,
      totalUsage,
      usageByDay,
    };

    const result = {
      data: promotions,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      statistics,
    };

    return result;
  }

  // Get promotion by ID
  async getById(id: number) {


    const promotion = await prisma.promotion.findUnique({
      where: { id },
      include: {
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
        canceller: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        products: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                productName: true,
                unit: true,
                sellingPriceRetail: true,
              },
            },
            giftProduct: {
              select: {
                id: true,
                sku: true,
                productName: true,
                unit: true,
              },
            },
          },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundError('Khuyến mãi');
    }

    return promotion;
  }

  // Create new promotion
  async create(data: CreatePromotionInput, userId: number) {



    const existingCode = await prisma.promotion.findUnique({
      where: { promotionCode: data.promotionCode },
    });

    if (existingCode) {
      throw new ConflictError('Mã khuyến mãi đã tồn tại');
    }
    if (!data.startDate || !data.endDate) {
      throw new Error('startDate and endDate are required');
    }

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);

    if (start > end) {
      throw new Error('Ngày bắt đầu phải nhỏ hơn ngày kết thúc');
    }
    // Validate promotion type specific fields
    this.validatePromotionType(data);
    console.log(typeof (data.products?.[0].productId))
    if (data.applicableTo === "all" && data.products?.[0]?.productId === 0) {
      const promotion = await prisma.promotion.create({
        data: {
          promotionCode: data.promotionCode,
          promotionName: data.promotionName,
          promotionType: data.promotionType,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          isRecurring: data.isRecurring || false,
          applicableTo: data.applicableTo,
          minOrderValue: data.minOrderValue || 0,
          minQuantity: data.minQuantity || 0,
          conditions: data.conditions || Prisma.JsonNull,
          quantityLimit: data.quantityLimit,
          createdBy: userId,
        },
        select: {
          id: true,
          promotionCode: true
        }
      });

      (await prisma.product.findMany({
        select: {
          id: true,
        }
      })).map((async ({ id }) => {
        return await prisma.promotionProduct.create({
          data: {
            promotionId: promotion.id,
            productId: id,
            giftProductId: data.products?.[0].giftProductId,
            giftQuantity: data.products?.[0].giftQuantity
          }
        })
      }))

      logActivity('create', userId, 'promotions', {
        id: promotion.id,
        code: promotion.promotionCode,
      });

      return promotion;
    }
    else {
      const promotion = await prisma.promotion.create({
        data: {
          promotionCode: data.promotionCode,
          promotionName: data.promotionName,
          promotionType: data.promotionType,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          isRecurring: data.isRecurring || false,
          applicableTo: data.applicableTo,
          minOrderValue: data.minOrderValue || 0,
          minQuantity: data.minQuantity || 0,
          conditions: data.conditions || Prisma.JsonNull,
          quantityLimit: data.quantityLimit,
          createdBy: userId,

          ...(data.products && {
            products: {
              create: data.products.map((p) => ({
                productId: p.productId,
                discountValueOverride: p.discountValueOverride,
                minQuantity: p.minQuantity || 1,
                giftProductId: p.giftProductId,
                giftQuantity: p.giftQuantity || 0,
                note: p.note,
              })),
            },
          }),
        },
        include: {
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
          products: {
            include: {
              product: true,
              giftProduct: true,
            },
          },
        },
      });

      // Log activity
      logActivity('create', userId, 'promotions', {
        id: promotion.id,
        code: promotion.promotionCode,
      });

      return promotion;
    }
  }

  // Update promotion
  async update(id: number, data: UpdatePromotionInput | undefined, userId: number) {
    if (!data) {
      throw new ValidationError('Dữ liệu cập nhật là bắt buộc');
    }

    const existing = await prisma.promotion.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Khuyến mãi');
    }

    if (!data.startDate || !data.endDate) {
      throw new Error('startDate and endDate are required');
    }

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);

    if (start > end) {
      throw new Error('Ngày bắt đầu phải nhỏ hơn ngày kết thúc');
    }


    // Cannot update if already active or expired
    if (existing.status === 'active' || existing.status === 'expired') {
      throw new ValidationError(`Không thể cập nhật khuyến mãi có trạng thái: ${existing.status}`);
    }

    // If products are provided, delete old and create new
    console.log('[UPDATE] data received:', JSON.stringify(data, null, 2));
    const updateData: any = {
      ...(data.promotionName && { promotionName: data.promotionName }),
      ...(data.promotionType && { promotionType: data.promotionType }),
      ...(data.applicableTo && { applicableTo: data.applicableTo }),
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
      ...(data.isRecurring !== undefined && { isRecurring: data.isRecurring }),
      ...(data.minOrderValue !== undefined && { minOrderValue: data.minOrderValue }),
      ...(data.minQuantity !== undefined && { minQuantity: data.minQuantity }),
      ...(data.conditions !== undefined && { conditions: data.conditions || Prisma.JsonNull }),
      ...(data.quantityLimit !== undefined && { quantityLimit: data.quantityLimit }),
    };
    console.log('[UPDATE] updateData:', JSON.stringify(updateData, null, 2));

    const isAllProductsBuyXGetY =
      data.products &&
      data.products.length > 0 &&
      data.products[0].productId === 0;

    const promotion = await prisma.$transaction(async (tx) => {
      // Delete existing products if new products provided (including empty array = clear all)
      if (data.products !== undefined) {
        await tx.promotionProduct.deleteMany({
          where: { promotionId: id },
        });
      }

      // For buy_x_get_y with applicableTo=all: create PromotionProduct for every product
      if (isAllProductsBuyXGetY) {
        const allProducts = await tx.product.findMany({ select: { id: true } });
        await tx.promotionProduct.createMany({
          data: allProducts.map(({ id: productId }) => ({
            promotionId: id,
            productId,
            giftProductId: data.products![0].giftProductId,
            giftQuantity: data.products![0].giftQuantity || 0,
          })),
        });
      }

      // Update promotion
      return await tx.promotion.update({
        where: { id },
        data: {
          ...updateData,
          // Only inline-create products when productId != 0 (not "all products" case)
          ...(data.products && data.products.length > 0 && !isAllProductsBuyXGetY && {
            products: {
              create: data.products.map((p) => ({
                productId: p.productId,
                discountValueOverride: p.discountValueOverride,
                minQuantity: p.minQuantity || 0,
                giftProductId: p.giftProductId,
                giftQuantity: p.giftQuantity || 0,
                note: p.note,
              })),
            },
          }),
        },
        include: {
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
          products: {
            include: {
              product: true,
              giftProduct: true,
            },
          },
        },
      });
    });

    // Log activity
    logActivity('update', userId, 'promotions', { id, changes: Object.keys(updateData) });

    return promotion;
  }

  // Approve promotion
  async approve(id: number, userId: number) {
    const promotion = await prisma.promotion.findUnique({
      where: { id },
    });

    if (!promotion) {
      throw new NotFoundError('Khuyến mãi');
    }

    if (promotion.status !== 'pending') {
      throw new ValidationError('Chỉ có thể phê duyệt khuyến mãi đang chờ duyệt');
    }

    const updated = await prisma.promotion.update({
      where: { id },
      data: {
        status: 'active',
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: {
        creator: true,
        approver: true,
        products: {
          include: {
            product: true,
            giftProduct: true,
          },
        },
      },
    });

    // Log activity
    logActivity('approve', userId, 'promotions', { id, code: updated.promotionCode });

    return updated;
  }

  // Cancel promotion
  async cancel(id: number, reason: string, userId: number) {
    const promotion = await prisma.promotion.findUnique({
      where: { id },
    });

    if (!promotion) {
      throw new NotFoundError('Khuyến mãi');
    }

    if (promotion.status === 'cancelled' || promotion.status === 'expired') {
      throw new ValidationError(
        `Khuyến mãi đã ${promotion.status === 'cancelled' ? 'hủy' : 'hết hạn'}`
      );
    }

    const updated = await prisma.promotion.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledBy: userId,
        cancelledAt: new Date(),
      },
      include: {
        creator: true,
        canceller: true,
      },
    });

    // Log activity
    logActivity('cancel', userId, 'promotions', { id, reason, code: updated.promotionCode });

    return updated;
  }

  // Restore cancelled promotion to pending
  async restore(id: number, userId: number) {
    const promotion = await prisma.promotion.findUnique({
      where: { id },
    });

    if (!promotion) {
      throw new NotFoundError('Khuyến mãi');
    }

    if (promotion.status !== 'cancelled') {
      throw new ValidationError('Chỉ có thể hoàn trả các khuyến mãi đã bị hủy');
    }

    const updated = await prisma.promotion.update({
      where: { id },
      data: {
        status: 'pending',
        cancelledBy: null,
        cancelledAt: null,
      },
      include: {
        creator: true,
      },
    });

    // Log activity
    logActivity('update', userId, 'promotions', { id, action: 'restore', code: updated.promotionCode });

    return updated;
  }

  // Delete promotion (soft delete)
  async delete(id: number, userId: number) {
    const promotion = await prisma.promotion.findUnique({
      where: { id },
    });

    if (!promotion) {
      throw new NotFoundError('Promotion');
    }

    if (promotion.status !== 'cancelled') {
      throw new ValidationError('Chỉ có thể xóa khuyến mãi ở trạng thái đã hủy');
    }

    const updated = await prisma.promotion.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
      include: {
        creator: true,
        approver: true,
      },
    });

    // Log activity
    logActivity('delete', userId, 'promotions', { id, code: updated.promotionCode });

    return updated;
  }

  // Bulk delete promotions (soft delete)
  async bulkDelete(ids: number[], userId: number) {
    // Filter out promotions that can't be deleted (not pending or cancelled)
    const validPromotions = await prisma.promotion.findMany({
      where: {
        id: { in: ids },
        status: 'cancelled',
        deletedAt: null
      },
    });

    const validIds = validPromotions.map(p => p.id);

    if (validIds.length === 0) {
      throw new ValidationError('Không có khuyến mãi nào hợp lệ để xóa (phải ở trạng thái chờ duyệt hoặc đã hủy)');
    }

    const result = await prisma.promotion.updateMany({
      where: {
        id: { in: validIds }
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // Log activity for each deleted promotion
    validPromotions.forEach(promotion => {
      logActivity('delete', userId, 'promotions', { id: promotion.id, code: promotion.promotionCode, bulk: true });
    });

    return { count: result.count, deletedIds: validIds };
  }

  // Bulk cancel promotions
  async bulkCancel(ids: number[], reason: string, userId: number) {
    const validPromotions = await prisma.promotion.findMany({
      where: {
        id: { in: ids },
        status: { notIn: ['cancelled', 'expired'] },
        deletedAt: null
      },
    });

    const validIds = validPromotions.map(p => p.id);

    if (validIds.length === 0) {
      throw new ValidationError('Không có khuyến mãi nào hợp lệ để hủy');
    }

    const result = await prisma.promotion.updateMany({
      where: {
        id: { in: validIds }
      },
      data: {
        status: 'cancelled',
        cancelledBy: userId,
        cancelledAt: new Date(),
      },
    });

    validPromotions.forEach(promotion => {
      logActivity('cancel', userId, 'promotions', { id: promotion.id, reason, code: promotion.promotionCode, bulk: true });
    });

    return { count: result.count, cancelledIds: validIds };
  }

  // Bulk restore promotions
  async bulkRestore(ids: number[], userId: number) {
    const validPromotions = await prisma.promotion.findMany({
      where: {
        id: { in: ids },
        status: 'cancelled',
        deletedAt: null
      },
    });

    const validIds = validPromotions.map(p => p.id);

    if (validIds.length === 0) {
      throw new ValidationError('Không có khuyến mãi nào hợp lệ để khôi phục');
    }

    const result = await prisma.promotion.updateMany({
      where: {
        id: { in: validIds }
      },
      data: {
        status: 'pending',
        cancelledBy: null,
        cancelledAt: null,
      },
    });

    validPromotions.forEach(promotion => {
      logActivity('update', userId, 'promotions', { id: promotion.id, action: 'restore', code: promotion.promotionCode, bulk: true });
    });

    return { count: result.count, restoredIds: validIds };
  }

  // Bulk approve promotions
  async bulkApprove(ids: number[], notes: string, userId: number) {
    const validPromotions = await prisma.promotion.findMany({
      where: {
        id: { in: ids },
        status: 'pending',
        deletedAt: null
      },
    });

    const validIds = validPromotions.map(p => p.id);

    if (validIds.length === 0) {
      throw new ValidationError('Không có khuyến mãi nào hợp lệ để duyệt (phải ở trạng thái chờ duyệt)');
    }

    const result = await prisma.promotion.updateMany({
      where: {
        id: { in: validIds }
      },
      data: {
        status: 'active',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    validPromotions.forEach(promotion => {
      logActivity('approve', userId, 'promotions', { id: promotion.id, code: promotion.promotionCode, notes, bulk: true });
    });

    return { count: result.count, approvedIds: validIds };
  }

  // Get active promotions
  async getActive(date?: string) {
    const checkDate = date ? new Date(date) : new Date();

    const promotions = await prisma.promotion.findMany({
      where: {
        status: 'active',
        startDate: { lte: checkDate },
        endDate: { gte: checkDate },
      },
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                productName: true,
                categoryId: true,
              },
            },
            giftProduct: {
              select: {
                id: true,
                sku: true,
                productName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return promotions;
  }

  // Apply promotion to order
  async apply(id: number, data: ApplyPromotionInput): Promise<ApplyPromotionResult> {
    const promotion = await prisma.promotion.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            product: true,
            giftProduct: true,
          },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundError('Khuyến mãi');
    }

    // Check if promotion is active
    const now = new Date();
    if (promotion.status !== 'active') {
      return {
        applicable: false,
        discountAmount: 0,
        finalAmount: data.orderAmount,
        message: `Khuyến mãi đang ở trạng thái ${promotion.status}`,
      };
    }

    if (now < promotion.startDate || now > promotion.endDate) {
      return {
        applicable: false,
        discountAmount: 0,
        finalAmount: data.orderAmount,
        message: 'Khuyến mãi không trong khoảng thời gian hiệu lực',
      };
    }

    // Check quantity limit
    if (promotion.quantityLimit && promotion.usageCount >= promotion.quantityLimit) {
      return {
        applicable: false,
        discountAmount: 0,
        finalAmount: data.orderAmount,
        message: 'Đã đạt giới hạn sử dụng khuyến mãi',
      };
    }

    // Check minimum order value
    if (data.orderAmount < Number(promotion.minOrderValue)) {
      return {
        applicable: false,
        discountAmount: 0,
        finalAmount: data.orderAmount,
        message: `Giá trị đơn hàng tối thiểu là ${promotion.minOrderValue}`,
      };
    }

    // Check conditions
    const conditionsResult = this.checkConditions(promotion, data);
    if (!conditionsResult.applicable) {
      return {
        applicable: false,
        discountAmount: 0,
        finalAmount: data.orderAmount,
        message: conditionsResult.message,
      };
    }

    // Calculate discount based on promotion type
    return this.calculateDiscount(promotion, data);
  }

  // Check promotion conditions
  private checkConditions(
    promotion: any,
    data: ApplyPromotionInput
  ): { applicable: boolean; message?: string } {
    if (!promotion.conditions) {
      return { applicable: true };
    }

    const conditions = promotion.conditions as PromotionConditions;

    // Check customer type
    if (conditions.applicable_customer_types && data.customerType) {
      if (!conditions.applicable_customer_types.includes(data.customerType)) {
        return {
          applicable: false,
          message: 'Loại khách hàng không đủ điều kiện cho khuyến mãi này',
        };
      }
    }

    // Check day of week
    if (conditions.days_of_week) {
      const dayOfWeek = new Date().getDay();
      if (!conditions.days_of_week.includes(dayOfWeek)) {
        return {
          applicable: false,
          message: 'Khuyến mãi không áp dụng vào ngày này',
        };
      }
    }

    // Check time slot
    if (conditions.time_slots && conditions.time_slots.length > 0) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;

      const inTimeSlot = conditions.time_slots.some((slot) => {
        const [start, end] = slot.split('-');
        return currentTime >= start && currentTime <= end;
      });

      if (!inTimeSlot) {
        return {
          applicable: false,
          message: 'Khuyến mãi không áp dụng vào thời gian này',
        };
      }
    }

    // Check applicable categories
    if (conditions.applicable_categories && conditions.applicable_categories.length > 0) {
      const orderCategories = data.orderItems
        .map((item) => {
          const productPromo = promotion.products?.find((p: any) => p.productId === item.productId);
          return productPromo?.product?.categoryId;
        })
        .filter((catId: number | undefined): catId is number => catId !== undefined);

      const hasMatchingCategory = orderCategories.some((catId) =>
        conditions.applicable_categories!.includes(catId)
      );

      if (!hasMatchingCategory) {
        return {
          applicable: false,
          message: 'Không có sản phẩm nào trong danh mục áp dụng',
        };
      }
    }

    return { applicable: true };
  }

  // Calculate discount amount
  private calculateDiscount(promotion: any, data: ApplyPromotionInput): ApplyPromotionResult {
    let discountAmount = 0;
    const giftProducts: { productId: number; quantity: number }[] = [];

    switch (promotion.promotionType) {
      case 'buy_x_get_y': {
        const conditions = promotion.conditions as PromotionConditions;
        if (conditions.buy_quantity && conditions.get_quantity) {
          // Find applicable products
          data.orderItems.forEach((item) => {
            const productPromo = promotion.products?.find(
              (p: any) => p.productId === item.productId
            );

            if (productPromo && item.quantity >= conditions.buy_quantity!) {
              const setsCount = Math.floor(item.quantity / conditions.buy_quantity!);
              const giftQty = setsCount * conditions.get_quantity!;

              if (conditions.get_same_product) {
                // Gift is the same product
                giftProducts.push({
                  productId: item.productId,
                  quantity: giftQty,
                });
              } else if (productPromo.giftProductId) {
                // Gift is different product
                giftProducts.push({
                  productId: productPromo.giftProductId,
                  quantity: giftQty,
                });
              }
            }
          });
        }
        break;
      }

      case 'gift': {
        // Add gift products
        promotion.products?.forEach((pp: any) => {
          if (pp.giftProductId && pp.giftQuantity > 0) {
            const orderItem = data.orderItems.find((i) => i.productId === pp.productId);
            if (orderItem && orderItem.quantity >= pp.minQuantity) {
              giftProducts.push({
                productId: pp.giftProductId,
                quantity: pp.giftQuantity,
              });
            }
          }
        });
        break;
      }
    }

    // Ensure discount doesn't exceed order amount
    if (discountAmount > data.orderAmount) {
      discountAmount = data.orderAmount;
    }

    return {
      applicable: true,
      discountAmount,
      finalAmount: data.orderAmount - discountAmount,
      ...(giftProducts.length > 0 && { giftProducts }),
    };
  }

  // Validate promotion type specific fields
  private validatePromotionType(data: CreatePromotionInput) {
    switch (data.promotionType) {
      case 'buy_x_get_y': {
        const conditions = data.conditions as PromotionConditions | undefined;
        if (
          !conditions ||
          !conditions.buy_quantity ||
          !conditions.get_quantity ||
          conditions.buy_quantity <= 0 ||
          conditions.get_quantity <= 0
        ) {
          throw new ValidationError(
            'Khuyến mãi Mua X Tặng Y yêu cầu buy_quantity và get_quantity hợp lệ trong điều kiện'
          );
        }
        break;
      }

      case 'gift': {
        if (!data.conditions) {
          throw new ValidationError('Khuyến mãi quà tặng yêu cầu ít nhất một sản phẩm');
        }

        break;
      }
    }
  }

  // Auto-expire promotions (should be called by cron job)
  async autoExpirePromotions() {
    const now = new Date();

    const expired = await prisma.promotion.updateMany({
      where: {
        status: 'active',
        endDate: { lt: now },
      },
      data: {
        status: 'expired',
      },
    });

    return expired.count;
  }

  // Increment usage count
  async incrementUsage(id: number) {
    const promotion = await prisma.promotion.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
      },
    });

    return promotion;
  }
  // Promotion statistics (for dashboard)
  async getStatistics() {

    const promotions = await prisma.promotion.findMany({
      where: { deletedAt: null },
      select: {
        status: true,
        usageCount: true,
        startDate: true,
        endDate: true,
        createdAt: true,
      },
    });

    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const statistics = {
      totalPromotions: promotions.length,
      activePromotions: promotions.filter(p => p.status === 'active').length,
      pendingPromotions: promotions.filter(p => p.status === 'pending').length,
      expiredPromotions: promotions.filter(p => p.status === 'expired').length,
      cancelledPromotions: promotions.filter(p => p.status === 'cancelled').length,
      expiringSoon: promotions.filter(
        p =>
          p.status === 'active' &&
          p.endDate >= threeDaysLater &&
          p.endDate <= sevenDaysLater
      ).length,
      totalUsage: promotions.reduce((sum, p) => sum + p.usageCount, 0),
    };

    return statistics;
  }


}

export default new PromotionService();
