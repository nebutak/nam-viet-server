import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import customerService from './customer.service';
import notificationService from './notification.service';
import promotionService from './promotion.service';
import {
  CreateInvoiceInput,
  UpdateInvoiceInput,
  ApproveOrderInput,
  CancelOrderInput,
  ProcessPaymentInput,
  InvoiceQueryInput,
} from '@validators/invoice.validator';

const prisma = new PrismaClient();

class InvoiceService {
  private async generateOrderCode(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const count = await prisma.invoice.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    const sequence = (count + 1).toString().padStart(3, '0');
    return `DB-${dateStr}-${sequence}`;
  }



  async getAll(query: InvoiceQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      customerId,
      warehouseId,
      createdBy,
      orderStatus,
      paymentStatus,
      salesChannel,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    // Normalize orderStatus - handle both orderStatus and orderStatus[] keys from query params
    let normalizedOrderStatus = orderStatus;
    if (!normalizedOrderStatus && (query as any)['orderStatus[]']) {
      normalizedOrderStatus = (query as any)['orderStatus[]'];
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // Normalize orderStatus - can be single value or array
    const normalizeOrderStatusFilter = (status: any): any => {
      if (!status) return undefined;
      if (Array.isArray(status)) {
        return { in: status };
      }
      return status;
    };

    const where = {
      ...(customerId && { customerId: Number(customerId) }),
      ...(warehouseId && { warehouseId: Number(warehouseId) }),
      ...(createdBy && { createdBy: Number(createdBy) }),
      ...(normalizedOrderStatus && {
        orderStatus: normalizeOrderStatusFilter(normalizedOrderStatus),
      }),
      ...(paymentStatus && { paymentStatus }),
      ...(salesChannel && { salesChannel }),
      ...(search && {
        OR: [
          { orderCode: { contains: search } },
          { customer: { customerName: { contains: search } } },
          { customer: { phone: { contains: search } } },
        ],
      }),
      ...(fromDate &&
        toDate && {
          orderDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    } as Prisma.InvoiceWhereInput;

    const [orders, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              customerCode: true,
              customerName: true,
              customerType: true,
              phone: true,
              cccd: true,
              taxCode: true,
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
              details: true,
            },
          },
        },
        skip: offset,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.invoice.count({ where }),
    ]);

    const ordersWithRemaining = orders.map((order) => ({
      ...order,
      remainingAmount: Number(order.totalAmount) - Number(order.paidAmount),
    }));

    return {
      data: ordersWithRemaining,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  // Get all invoices created by this user only
  async getAllByUser(query: InvoiceQueryInput, userId: number) {
    return this.getAll({ ...query, createdBy: userId } as any);
  }

  // Get invoice detail - only if created by this user
  async getByIdForUser(id: number, userId: number) {
    const order = await prisma.invoice.findFirst({
      where: { id, createdBy: userId },
      include: {
        customer: {
          select: {
            id: true, customerCode: true, customerName: true,
            phone: true, email: true, address: true,
            creditLimit: true, currentDebt: true,
          },
        },
        details: {
          include: {
            product: { 
              select: { 
                id: true, 
                code: true, 
                productName: true, 
                image: true, 
                unit: true
              } 
            },
            warehouse: { select: { id: true, warehouseName: true } },
          },
        },
        creator: { select: { id: true, fullName: true, employeeCode: true, email: true } },
        paymentReceipts: {
          where: { deletedAt: null },
          include: {
            creator: { select: { id: true, fullName: true, email: true } }
          }
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn này');
    }

    return { ...order, remainingAmount: Number(order.totalAmount) - Number(order.paidAmount) };
  }

  async getById(id: number) {

    const order = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            customerCode: true,
            customerName: true,
            phone: true,
            email: true,
            address: true,
            creditLimit: true,
            currentDebt: true,
            cccd: true,
            taxCode: true,
          },
        },
        details: {
          include: {
            product: {
              select: {
                id: true,
                code: true,
                productName: true,
                image: true,
                unit: true,
                note: true,
              },
            },
            warehouse: {
              select: {
                id: true,
                warehouseName: true,
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
            phone: true,
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
        deliveries: {
          select: {
            id: true,
            deliveryCode: true,
            deliveryStatus: true,
            deliveryDate: true,
          },
        },
        paymentReceipts: {
          where: { deletedAt: null },
          include: {
            creator: { select: { id: true, fullName: true, email: true } }
          }
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    const result = {
      ...order,
      remainingAmount: Number(order.totalAmount) - Number(order.paidAmount),
    };

    return result;
  }

  async create(data: CreateInvoiceInput, userId: number) {
    let customerId = data.customerId;

    let validatedCustomer: any = null;

    // Handle Customer logic
    if (customerId) {
      validatedCustomer = await customerService.getById(Number(customerId));
      if (validatedCustomer.status !== 'active') {
        throw new ValidationError('Khách hàng phải ở trạng thái hoạt động để tạo đơn hàng');
      }

      // If newCustomer data is provided while customerId exists, update the customer
      if (data.newCustomer) {
        await prisma.customer.update({
          where: { id: Number(customerId) },
          data: {
            customerName: data.newCustomer.customerName || validatedCustomer.customerName,
            phone: data.newCustomer.phone || validatedCustomer.phone,
            email: data.newCustomer.email || validatedCustomer.email,
            address: data.newCustomer.address || validatedCustomer.address,
            cccd: data.newCustomer.cccd || validatedCustomer.cccd,
            issuedAt: data.newCustomer.issuedAt ? new Date(data.newCustomer.issuedAt) : validatedCustomer.issuedAt,
            issuedBy: data.newCustomer.issuedBy || validatedCustomer.issuedBy,
          }
        });
      }
    } else if (data.newCustomer) {
      // Create new customer
      const newCust = await prisma.customer.create({
        data: {
          customerName: data.newCustomer.customerName || 'Khách hàng mới',
          customerCode: `KH-${Date.now()}`,
          customerType: 'individual',
          phone: data.newCustomer.phone || '',
          email: data.newCustomer.email || null,
          address: data.newCustomer.address || null,
          cccd: data.newCustomer.cccd || null,
          issuedAt: data.newCustomer.issuedAt ? new Date(data.newCustomer.issuedAt) : null,
          issuedBy: data.newCustomer.issuedBy || null,
          status: 'active',
          createdBy: userId,
        }
      });
      customerId = newCust.id;
      validatedCustomer = newCust;
    } else {
       throw new ValidationError('Thông tin khách hàng không hợp lệ. Vui lòng chọn khách hàng hoặc cung cấp thông tin khách hàng mới.');
    }

    if (data.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: data.warehouseId },
      });

      if (!warehouse || warehouse.status !== 'active') {
        throw new ValidationError('Kho phải tồn tại và đang hoạt động');
      }
    }

    const productIds = data.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundError('Một hoặc nhiều sản phẩm không tồn tại');
    }

    for (const product of products) {
      if (product.status !== 'active') {
        throw new ValidationError(`Sản phẩm "${product.productName}" không ở trạng thái hoạt động`);
      }
    }

    const inventoryShortages: Array<{
      productName: string;
      requested: number;
      available: number;
    }> = [];

    for (const item of data.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;

      const warehouseId = item.warehouseId || data.warehouseId;
      if (warehouseId) {
        const inventory = await prisma.inventory.findFirst({
          where: {
            productId: item.productId,
            warehouseId,
          },
        });

        if (inventory) {
          const available = Number(inventory.quantity) - Number(inventory.reservedQuantity);
          if (available < item.quantity) {
            inventoryShortages.push({
              productName: product.productName,
              requested: item.quantity,
              available,
            });
          }
        } else {
          inventoryShortages.push({
            productName: product.productName,
            requested: item.quantity,
            available: 0,
          });
        }
      }
    }

    let subtotal = 0;
    const itemsWithCalculations = data.items.map((item) => {
      const discountPercent = item.discountPercent || 0;
      const taxRate = 0; // Tax rate no longer tied to product directly in this simplified version

      const unitPrice = item.unitPrice || item.price || 0;
      const lineTotal = item.quantity * unitPrice;
      const discountAmount = lineTotal * (discountPercent / 100);
      const taxableAmount = lineTotal - discountAmount;
      const taxAmount = taxableAmount * (Number(taxRate) / 100);
      const lineAmount = taxableAmount + taxAmount;

      subtotal += lineAmount;

      return {
        ...item,
        unitPrice,
      };
    });

    // ─── PROMOTION LOGIC ──────────────────────────────────────────────────────
    let giftItems: Array<typeof data.items[0] & { taxRate: number, discountPercent: number, unitPrice: number, isGift?: boolean }> = [];

    if (data.promotionId) {
      // Fetch promotion from DB and validate conditions
      const applyResult = await promotionService.apply(data.promotionId, {
        orderAmount: subtotal,
        orderItems: data.items.map((item) => ({  
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice || item.price || 0, // Fallback to price or 0
        })),
        customerId: Number(customerId),
      });

      if (!applyResult.applicable) {
        throw new ValidationError(applyResult.message || 'Khuyến mãi không thể áp dụng cho đơn hàng này');
      }

      // promotionDiscountAmount used only for gift logic below

      // Build gift product items (unitPrice = 0) to add into invoice details
      if (applyResult.giftProducts && applyResult.giftProducts.length > 0) {
        giftItems = applyResult.giftProducts.map((gift) => ({
          productId: gift.productId,
          quantity: gift.quantity,
          unitPrice: 0,
          discountPercent: 0,
          taxRate: 0,
          notes: 'Sản phẩm tặng kèm',
          isGift: true,
        }));
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Dùng trực tiếp giảm giá do Client gửi lên (Bao gồm cả KM và nhập tay nếu có)
    const effectiveDiscountAmount = data.discountAmount || 0;

    // Merge gift items into calculation list (they go to invoice details and stock export)
    const allItemsWithCalculations = [...itemsWithCalculations, ...giftItems];

    // Sử dụng trực tiếp dữ liệu chuẩn từ Client gửi lên thay vì tự tính lại
    const computedAmount = data.amount || subtotal; // Tổng tiền hàng (trước thuế)
    const totalAmount = data.totalAmount || (computedAmount + (Number(data.shippingFee) || 0) - effectiveDiscountAmount);
    const paidAmount = data.paidAmount || 0;

    // Validate payment amount vs total
    if (paidAmount > totalAmount) {
      throw new ValidationError(
        `Số tiền thanh toán (${paidAmount}) không thể vượt quá tổng tiền (${totalAmount})`
      );
    }

    // For credit/installment payment, check remaining debt
    if (
      (data.paymentMethod === 'credit' || data.paymentMethod === 'installment') &&
      paidAmount < totalAmount
    ) {
      const debtFromThisOrder = totalAmount - paidAmount;
      const newDebt = Number(validatedCustomer?.currentDebt || 0) + debtFromThisOrder;
      const limit = Number(validatedCustomer?.creditLimit || Infinity);
      if (limit > 0 && newDebt > limit) {
        throw new ValidationError(
          `Đơn hàng vượt quá hạn mức tín dụng của khách hàng. Công nợ hiện tại: ${validatedCustomer?.currentDebt || 0}, Công nợ mới từ đơn hàng: ${debtFromThisOrder}, Hạn mức tín dụng: ${limit}`
        );
      }
    }
    const orderCode = await this.generateOrderCode();

    // Set order status based on requireApproval
    const initialOrderStatus = data.requireApproval ? 'pending' : 'preparing';

    let result: any;

    // Route to appropriate handler based on pickup/delivery
    if (data.isPickupOrder) {
      result = await this.createPickupOrder(
        { ...data, customerId: Number(customerId) } as any,
        allItemsWithCalculations,
        orderCode,
        totalAmount,
        paidAmount,
        userId,
        inventoryShortages,
        effectiveDiscountAmount,
        initialOrderStatus
      );
    } else {
      result = await this.createDeliveryOrder(
        { ...data, customerId: Number(customerId) } as any,
        allItemsWithCalculations,
        orderCode,
        totalAmount,
        paidAmount,
        userId,
        inventoryShortages,
        effectiveDiscountAmount,
        initialOrderStatus
      );
    }

    // ─── Increment promotion usage count after order commit ──────────────────
    if (data.promotionId) {
      // Fire-and-forget (non-blocking)
      promotionService.incrementUsage(data.promotionId).catch((err) =>
        console.error('Failed to increment promotion usage count', err)
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Trigger notification (fire and forget)
    notificationService.notifyNewOrder({
        orderId: result.id,
        orderCode: result.orderCode,
        customerName: result.customer?.customerName || 'Khách lẻ',
        totalAmount: Number(result.totalAmount)
    }).catch(err => console.error('Failed to send new order notification', err));

    return result;
  }

  private async createPickupOrder(
    data: CreateInvoiceInput,
    itemsWithCalculations: any[],
    orderCode: string,
    totalAmount: number,
    paidAmount: number,
    userId: number,
    inventoryShortages: any[],
    discountAmount: number,
    initialOrderStatus: string
  ) {
    if (inventoryShortages.length > 0) {
      throw new ValidationError(
        'Không đủ tồn kho để thực hiện đơn hàng lấy ngay',
        inventoryShortages
      );
    }

    // Tạo đơn bán + chi tiết. Phiếu xuất kho & phiếu thu sẽ tạo thủ công riêng biệt.
    const order = await prisma.invoice.create({
      data: {
        orderCode,
        customerId: Number(data.customerId) || 0,
        orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
        isPickupOrder: true,
        totalAmount,
        amount: Number(data.amount) || totalAmount,
        discountAmount,
        shippingFee: 0,
        taxAmount: Number(data.taxAmount) || 0,
        paidAmount,
        paymentStatus: paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        orderStatus: initialOrderStatus as string as any,
        completedAt: null, // Since it can be preparing/pending, it's not completed yet
        deliveryAddress: null,
        notes: data.notes,
        createdBy: userId,
        promotionId: data.promotionId ?? null,
        details: {
          create: itemsWithCalculations.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            baseQuantity: item.baseQuantity || item.quantity,
            conversionFactor: item.conversionFactor || 1,
            price: item.price || 0,
            discountRate: item.discountRate || 0,
            discountAmount: item.discountAmount || 0,
            taxRate: item.taxRate ? String(item.taxRate) : null,
            taxIds: item.taxIds || null,
            taxAmount: item.taxAmount || 0,
            total: item.total || 0,
            periodMonths: item.periodMonths ? String(item.periodMonths) : null,
            warrantyCost: item.warrantyCost ? Number(item.warrantyCost) : 0,
            applyWarranty: item.applyWarranty || false,
            unitId: item.unitId || null,
            unitName: item.unitName || null,
            gift: item.isGift || false,
          })),
        },
      },
      include: {
        customer: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    logActivity('create', userId, 'invoices', {
      recordId: order.id,
      orderCode: order.orderCode,
    });

    return order;
  }

  private async createDeliveryOrder(
    data: CreateInvoiceInput,
    itemsWithCalculations: any[],
    orderCode: string,
    totalAmount: number,
    paidAmount: number,
    userId: number,
    inventoryShortages: any[],
    discountAmount: number,
    initialOrderStatus: string
  ) {
    // Tạo đơn bán + chi tiết với trạng thái ban đầu.
    // Phiếu giao hàng, phiếu xuất kho, phiếu thu sẽ tạo thủ công riêng biệt.
    const order = await prisma.invoice.create({
      data: {
        orderCode,
        customerId: Number(data.customerId) || 0,
        orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
        isPickupOrder: false,
        totalAmount,
        amount: Number(data.amount) || totalAmount,
        discountAmount,
        shippingFee: Number(data.shippingFee) || 0,
        taxAmount: Number(data.taxAmount) || 0,
        paidAmount,
        paymentStatus: paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        orderStatus: initialOrderStatus as string as any,
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : null,
        deliveryAddress: data.deliveryAddress,
        recipientName: data.recipientName || null,
        recipientPhone: data.recipientPhone || null,
        notes: data.notes,
        createdBy: userId,
        promotionId: data.promotionId ?? null,
        details: {
          create: itemsWithCalculations.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            baseQuantity: item.baseQuantity || item.quantity,
            conversionFactor: item.conversionFactor || 1,
            price: item.price || 0,
            discountRate: item.discountRate || 0,
            discountAmount: item.discountAmount || 0,
            taxRate: item.taxRate ? String(item.taxRate) : null,
            taxIds: item.taxIds || null,
            taxAmount: item.taxAmount || 0,
            total: item.total || 0,
            periodMonths: item.periodMonths ? String(item.periodMonths) : null,
            warrantyCost: item.warrantyCost ? Number(item.warrantyCost) : 0,
            applyWarranty: item.applyWarranty || false,
            unitId: item.unitId || null,
            unitName: item.unitName || null,
            gift: item.isGift || false,
          })),
        },
      },
      include: {
        customer: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    logActivity('create', userId, 'invoices', {
      recordId: order.id,
      orderCode: order.orderCode,
    });

    return {
      order,
      inventoryShortages: inventoryShortages.length > 0 ? inventoryShortages : undefined,
    };
  }

  async update(id: number, data: UpdateInvoiceInput, userId: number) {
    const order = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    if (order.orderStatus !== 'pending') {
      throw new ValidationError('Chỉ có thể cập nhật đơn hàng ở trạng thái chờ xử lý');
    }

    const updatedOrder = await prisma.invoice.update({
      where: { id },
      data: {
        ...(data.orderDate && { orderDate: new Date(data.orderDate) }),
        ...(data.salesChannel && { salesChannel: data.salesChannel }),
        ...(data.deliveryAddress !== undefined && { deliveryAddress: data.deliveryAddress }),
        ...(data.discountAmount !== undefined && { discountAmount: data.discountAmount }),
        ...(data.shippingFee !== undefined && { shippingFee: data.shippingFee }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        customer: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    logActivity('update', userId, 'invoices', {
      recordId: id,
      orderCode: order.orderCode,
      changes: data,
    });

    return updatedOrder;
  }

  async approve(id: number, userId: number, data?: ApproveOrderInput) {
    const order = await prisma.invoice.findUnique({
      where: { id },
      include: {
        details: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    if (order.orderStatus !== 'pending') {
      throw new ValidationError('Chỉ có thể phê duyệt đơn hàng ở trạng thái chờ xử lý');
    }

    const updatedOrder = await prisma.invoice.update({
      where: { id },
      data: {
        orderStatus: 'preparing',
        approvedBy: userId,
        approvedAt: new Date(),
        notes: data?.notes ? `${order.notes || ''}\n${data.notes}` : order.notes,
      },
      include: {
        customer: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    logActivity('update', userId, 'invoices', {
      recordId: id,
      action: 'approve_order',
      orderCode: order.orderCode,
    });

    return updatedOrder;
  }

  // Giai đoạn 2: Xuất kho giao Shipper (pending/preparing -> delivering)
  // Lúc này thủ kho đưa hàng cho Shipper. Hàng thực sự mất đi.
  async updateDeliveryStatus(id: number, userId: number, newStatus: 'preparing' | 'delivering') {
    const order = await prisma.invoice.findUnique({
      where: { id },
      include: {
        details: true,
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    // Nếu là order lấy ngay (pickup), không cần transition trạng thái
    if (order.orderStatus === 'completed' && !order.deliveries?.length) {
      throw new ValidationError('Đơn hàng lấy ngay không cần cập nhật trạng thái giao hàng');
    }

    // Chỉ cho phép transition pending -> preparing -> delivering
    const currentStatus = order.orderStatus;
    if (newStatus === 'preparing' && currentStatus !== 'pending') {
      throw new ValidationError('Chỉ có thể chuyển sang "chuẩn bị" từ trạng thái "chờ xử lý"');
    }
    if (newStatus === 'delivering' && currentStatus !== 'preparing') {
      throw new ValidationError('Chỉ có thể chuyển sang "đang giao" từ trạng thái "đang chuẩn bị"');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Nếu chuyển sang delivering, phải xuất kho (trừ quantity + reservedQuantity)
      if (newStatus === 'delivering') {
        // Trừ inventory
        for (const detail of order.details) {
          if (detail.warehouseId) {
            const inventory = await tx.inventory.findFirst({
              where: {
                productId: detail.productId,
                warehouseId: detail.warehouseId,
              },
            });

            if (inventory) {
              await tx.inventory.update({
                where: { id: inventory.id },
                data: {
                  quantity: {
                    decrement: detail.quantity,
                  },
                  reservedQuantity: {
                    decrement: detail.quantity,
                  },
                  updatedBy: userId,
                },
              });
            }
          }
        }

        // Phiếu xuất kho sẽ được tạo thủ công sau, bỏ qua ở đây.
        // if (order.warehouseId) { ... }

        // Cập nhật Delivery status thành in_transit
        if (order.deliveries && order.deliveries.length > 0) {
          await tx.delivery.update({
            where: { id: order.deliveries[0].id },
            data: {
              deliveryStatus: 'in_transit',
            },
          });
        }
      }

      const updatedOrder = await tx.invoice.update({
        where: { id },
        data: {
          orderStatus: newStatus,
        },
        include: {
          customer: true,
          details: {
            include: {
              product: true,
            },
          },
          deliveries: true,
        },
      });

      return updatedOrder;
    });

    logActivity('update', userId, 'invoices', {
      recordId: id,
      action: `update_delivery_status_${newStatus}`,
      orderCode: order.orderCode,
    });

    return result;
  }

  async complete(id: number, userId: number) {
    const order = await prisma.invoice.findUnique({
      where: { id },
      include: {
        details: true,
        customer: true,
        deliveries: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    // Kiểm tra trạng thái - delivery order phải ở trạng thái delivering
    // Pickup order đã completed ở bước create, không cần complete lại
    if (order.orderStatus !== 'delivering') {
      throw new ValidationError('Chỉ có thể hoàn thành đơn hàng ở trạng thái đang giao');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Giai đoạn 3: Giao thành công - Giảm quantity và reservedQuantity từ inventory
      for (const detail of order.details) {
        if (detail.warehouseId) {
          const inventory = await tx.inventory.findFirst({
            where: {
              productId: detail.productId,
              warehouseId: detail.warehouseId,
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                quantity: {
                  decrement: detail.quantity,
                },
                reservedQuantity: {
                  decrement: detail.quantity,
                },
                updatedBy: userId,
              },
            });
          }
        }
      }

      const updatedOrder = await tx.invoice.update({
        where: { id },
        data: {
          orderStatus: 'completed',
          completedAt: new Date(),
        },
        include: {
          customer: true,
          details: {
            include: {
              product: true,
            },
          },
          deliveries: true,
        },
      });

      // Cập nhật Delivery status thành delivered
      if (order.deliveries && order.deliveries.length > 0) {
        await tx.delivery.update({
          where: { id: order.deliveries[0].id },
          data: {
            deliveryStatus: 'delivered',
          },
        });
      }

      return updatedOrder;
    });

    logActivity('update', userId, 'invoices', {
      recordId: id,
      action: 'complete_order',
      orderCode: order.orderCode,
    });

    return result;
  }

  async cancel(id: number, userId: number, data: CancelOrderInput) {
    const order = await prisma.invoice.findUnique({
      where: { id },
      include: {
        details: true,
        customer: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    if (order.orderStatus === 'completed') {
      throw new ValidationError('Không thể hủy đơn hàng đã hoàn thành');
    }

    if (order.orderStatus === 'cancelled') {
      throw new ValidationError('Đơn hàng đã được hủy');
    }

    // Không cho phép hủy khi đang giao (in_transit)
    if (order.orderStatus === 'delivering') {
      throw new ValidationError('Không thể hủy đơn hàng đang giao. Vui lòng liên hệ nhân viên giao hàng');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Giải phóng reservedQuantity (nếu là delivery order)
      for (const detail of order.details) {
        if (detail.warehouseId) {
          const inventory = await tx.inventory.findFirst({
            where: {
              productId: detail.productId,
              warehouseId: detail.warehouseId,
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                reservedQuantity: {
                  decrement: detail.quantity,
                },
                updatedBy: userId,
              },
            });
          }
        }
      }

      // Hoàn lại công nợ khách hàng nếu có ghi nợ
      if (order.paymentStatus !== 'paid' && Number(order.paidAmount) === 0) {
        const debtAmount = Number(order.totalAmount) - Number(order.paidAmount);
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            currentDebt: {
              decrement: debtAmount,
            },
            debtUpdatedAt: new Date(),
          },
        });
      }

      const updatedOrder = await tx.invoice.update({
        where: { id },
        data: {
          orderStatus: 'cancelled',
          cancelledBy: userId,
          cancelledAt: new Date(),
          notes: `${order.notes || ''}\n[ĐÃ HỦY] ${data.reason}`,
        },
        include: {
          customer: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      return updatedOrder;
    });

    logActivity('update', userId, 'invoices', {
      recordId: id,
      action: 'cancel_order',
      orderCode: order.orderCode,
      reason: data.reason,
    });

    return result;
  }

  async processPayment(id: number, userId: number, data: ProcessPaymentInput) {
    const order = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    if (order.orderStatus === 'cancelled') {
      throw new ValidationError('Không thể xử lý thanh toán cho đơn hàng đã hủy');
    }

    const remainingAmount = Number(order.totalAmount) - Number(order.paidAmount);
    if (data.paidAmount > remainingAmount) {
      throw new ValidationError(
        `Số tiền thanh toán (${data.paidAmount}) vượt quá số tiền còn lại (${remainingAmount})`
      );
    }

    const newPaidAmount = Number(order.paidAmount) + data.paidAmount;
    let paymentStatus: 'unpaid' | 'partial' | 'paid';

    if (newPaidAmount >= Number(order.totalAmount)) {
      paymentStatus = 'paid';
    } else if (newPaidAmount > 0) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'unpaid';
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.invoice.update({
        where: { id },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus,
        },
        include: {
          customer: true,
        },
      });

      // Cập nhật công nợ khách hàng (nếu này là thanh toán cho order ghi nợ)
      if (order.orderStatus === 'completed' && order.paymentStatus !== 'paid') {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            currentDebt: {
              decrement: data.paidAmount,
            },
            debtUpdatedAt: new Date(),
          },
        });
      }

      // Tạo PaymentReceipt - Có 2 trường hợp:
      // 1. COD (Thu hộ từ Shipper): receiptType = 'sales' (từ khách hàng)
      // 2. Thanh toán thêm (Ghi nợ -> Trả): receiptType = 'debt_collection' (từ khách nợ)
      const receiptType = data.paymentMethod === 'cash' && order.deliveries?.length ? 'sales' : 'debt_collection';
      
      const receiptCode = `PT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${
        Date.now() % 1000
      }`;

      const financePaymentMethod =
        data.paymentMethod === 'cash'
          ? 'cash'
          : data.paymentMethod === 'transfer'
          ? 'transfer'
          : 'card';

      await tx.paymentReceipt.create({
        data: {
          receiptCode,
          receiptType,
          customerId: order.customerId,
          orderId: id,
          amount: data.paidAmount,
          receiptDate: new Date(),
          paymentMethod: financePaymentMethod,
          notes: data.notes || (receiptType === 'sales' ? 'Thu tiền COD từ Shipper' : 'Thu công nợ'),
          createdBy: userId,
        },
      });

      // Cập nhật Delivery nếu là COD
      if (order.deliveries && order.deliveries.length > 0 && data.paymentMethod === 'cash') {
        await tx.delivery.update({
          where: { id: order.deliveries[0].id },
          data: {
            collectedAmount: {
              increment: data.paidAmount,
            },
            codAmount: Math.max(0, Number(order.deliveries[0].codAmount) - data.paidAmount),
          },
        });
      }

      return updatedOrder;
    });

    logActivity('update', userId, 'invoices', {
      recordId: id,
      action: 'process_payment',
      orderCode: order.orderCode,
      paidAmount: data.paidAmount,
    });

    return result;
  }

  async delete(id: number, userId: number) {
    const order = await prisma.invoice.findUnique({
      where: { id },
      include: {
        details: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    if (order.orderStatus !== 'pending') {
      throw new ValidationError('Chỉ có thể xóa đơn hàng ở trạng thái chờ xử lý');
    }

    await prisma.$transaction(async (tx) => {
      for (const detail of order.details) {
        if (detail.warehouseId) {
          const inventory = await tx.inventory.findFirst({
            where: {
              productId: detail.productId,
              warehouseId: detail.warehouseId,
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                reservedQuantity: {
                  decrement: detail.quantity,
                },
                updatedBy: userId,
              },
            });
          }
        }
      }

      await tx.invoice.delete({
        where: { id },
      });
    });

    logActivity('delete', userId, 'invoices', {
      recordId: id,
      orderCode: order.orderCode,
    });

    return { message: 'Xóa đơn hàng bán thành công' };
  }

}

export default new InvoiceService();
