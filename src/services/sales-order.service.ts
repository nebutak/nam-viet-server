import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import customerService from './customer.service';
import notificationService from './notification.service';
import {
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  ApproveOrderInput,
  CancelOrderInput,
  ProcessPaymentInput,
  SalesOrderQueryInput,
} from '@validators/sales-order.validator';
import { sortedQuery } from '@utils/redis';
import RedisService from './redis.service';

const prisma = new PrismaClient();
const redis = RedisService.getInstance();

const SALES_ORDER_CACHE_TTL = 3600;
const SALES_ORDER_LIST_CACHE_TTL = 600;

class SalesOrderService {
  private async generateOrderCode(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const count = await prisma.salesOrder.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    const sequence = (count + 1).toString().padStart(3, '0');
    return `DH-${dateStr}-${sequence}`;
  }

  private async generateDeliveryCode(tx: any): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const count = await tx.delivery.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    const sequence = (count + 1).toString().padStart(3, '0');
    return `GH-${dateStr}-${sequence}`;
  }

  async getAll(query: SalesOrderQueryInput) {
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

    // Cache key - use normalized query
    const cacheQuery = { ...query, orderStatus: normalizedOrderStatus };
    delete (cacheQuery as any)['orderStatus[]'];
    const cacheKey = `sales-order:list:${JSON.stringify(sortedQuery(cacheQuery))}`;

    const cache = await redis.get(cacheKey);
    if (cache) {
      console.log(`✅ Cache tìm thấy: ${cacheKey}`);
      return cache;
    }

    console.log(`❌ Không có cache: ${cacheKey}, đang truy vấn từ database...`);

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
    } as Prisma.SalesOrderWhereInput;

    const [orders, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              customerCode: true,
              customerName: true,
              phone: true,
              classification: true,
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
      prisma.salesOrder.count({ where }),
    ]);

    const ordersWithRemaining = orders.map((order) => ({
      ...order,
      remainingAmount: Number(order.totalAmount) - Number(order.paidAmount),
    }));

    // Stat Cards - Calculate statistics for all orders matching the filters
    const allOrders = await prisma.salesOrder.findMany({
      where,
      select: {
        id: true,
        totalAmount: true,
        discountAmount: true,
        taxAmount: true,
        shippingFee: true,
        paidAmount: true,
        orderStatus: true,
        paymentStatus: true,
      },
    });

    // Calculate stats
    const totalRevenue = allOrders
      .filter((o) => o.orderStatus !== 'cancelled')
      .reduce((sum, o) => {
        const finalAmount =
          Number(o.totalAmount) -
          Number(o.discountAmount) +
          Number(o.taxAmount) +
          Number(o.shippingFee);
        return sum + finalAmount;
      }, 0);

    const pendingOrders = allOrders.filter((o) => o.orderStatus === 'pending').length;

    const preparingOrders = allOrders.filter((o) => o.orderStatus === 'preparing').length;

    const deliveringOrders = allOrders.filter((o) => o.orderStatus === 'delivering').length;

    const unpaidDebt = allOrders
      .filter((o) => o.paymentStatus === 'unpaid' || o.paymentStatus === 'partial')
      .reduce((sum, o) => {
        const finalAmount =
          Number(o.totalAmount) -
          Number(o.discountAmount) +
          Number(o.taxAmount) +
          Number(o.shippingFee);
        const debtAmount = finalAmount - Number(o.paidAmount || 0);
        return sum + debtAmount;
      }, 0);

    const statistics = {
      totalRevenue,
      pending: pendingOrders,
      preparing: preparingOrders,
      delivering: deliveringOrders,
      unpaidDebt,
    };

    const result = {
      data: ordersWithRemaining,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      statistics,
    };

    await redis.set(cacheKey, result, SALES_ORDER_LIST_CACHE_TTL);

    return result;
  }

  async getById(id: number) {
    const cacheKey = `sales-order:${id}`;

    const cached = await redis.get(cacheKey);

    if (cached) {
      console.log(`✅ Cache tìm thấy: ${cacheKey}`);
      return cached;
    }

    console.log(`⚠️ Không có cache: ${cacheKey}, đang truy vấn từ database...`);

    const order = await prisma.salesOrder.findUnique({
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
            classification: true,
            creditLimit: true,
            currentDebt: true,
          },
        },
        warehouse: true,
        details: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                productName: true,
                unit: true,
                productType: true,
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
          select: {
            id: true,
            receiptCode: true,
            amount: true,
            receiptDate: true,
            paymentMethod: true,
          },
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

    await redis.set(cacheKey, result, SALES_ORDER_CACHE_TTL);

    return result;
  }

  async create(data: CreateSalesOrderInput, userId: number) {
    // Validate customer
    const customer = await customerService.getById(data.customerId);
    if (customer.status !== 'active') {
      throw new ValidationError('Khách hàng phải ở trạng thái hoạt động để tạo đơn hàng');
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
      const product = products.find((p) => p.id === item.productId);
      const discountPercent = item.discountPercent || 0;
      const taxRate = product?.taxRate || 0;

      const lineTotal = item.quantity * item.unitPrice;
      const discountAmount = lineTotal * (discountPercent / 100);
      const taxableAmount = lineTotal - discountAmount;
      const taxAmount = taxableAmount * (Number(taxRate) / 100);
      const lineAmount = taxableAmount + taxAmount;

      subtotal += lineAmount;

      return {
        ...item,
        taxRate: Number(taxRate),
      };
    });

    const totalAmount = subtotal + (data.shippingFee || 0) - (data.discountAmount || 0);
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
      const newDebt = Number(customer.currentDebt) + debtFromThisOrder;
      if (newDebt > Number(customer.creditLimit)) {
        throw new ValidationError(
          `Đơn hàng vượt quá hạn mức tín dụng của khách hàng. Công nợ hiện tại: ${customer.currentDebt}, Công nợ mới từ đơn hàng: ${debtFromThisOrder}, Hạn mức tín dụng: ${customer.creditLimit}`
        );
      }
    }

    const orderCode = await this.generateOrderCode();

    let result: any;

    // Route to appropriate handler based on pickup/delivery
    if (data.isPickupOrder) {
      result = await this.createPickupOrder(
        data,
        itemsWithCalculations,
        orderCode,
        totalAmount,
        paidAmount,
        userId,
        inventoryShortages
      );
    } else {
      result = await this.createDeliveryOrder(
        data,
        itemsWithCalculations,
        orderCode,
        totalAmount,
        paidAmount,
        userId,
        inventoryShortages
      );
    }

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
    data: CreateSalesOrderInput,
    itemsWithCalculations: any[],
    orderCode: string,
    totalAmount: number,
    paidAmount: number,
    userId: number,
    inventoryShortages: any[]
  ) {
    if (inventoryShortages.length > 0) {
      throw new ValidationError(
        'Không đủ tồn kho để thực hiện đơn hàng lấy ngay',
        inventoryShortages
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create order with completed status
      const order = await tx.salesOrder.create({
        data: {
          orderCode,
          customerId: data.customerId,
          warehouseId: data.warehouseId,
          orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
          salesChannel: data.salesChannel || 'retail',
          totalAmount,
          discountAmount: data.discountAmount || 0,
          shippingFee: 0, // No shipping fee for pickup
          taxAmount: 0,
          paidAmount,
          paymentMethod: data.paymentMethod,
          paymentStatus: paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
          orderStatus: 'completed',
          deliveryAddress: null,
          notes: data.notes,
          createdBy: userId,
          details: {
            create: itemsWithCalculations.map((item) => ({
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent || 0,
              taxRate: item.taxRate,
              notes: item.notes,
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

      // 2. Reduce inventory quantity immediately
      for (const item of data.items) {
        const warehouseId = item.warehouseId || data.warehouseId;
        if (warehouseId) {
          const inventory = await tx.inventory.findFirst({
            where: {
              productId: item.productId,
              warehouseId,
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                quantity: {
                  decrement: item.quantity,
                },
                updatedBy: userId,
              },
            });
          }
        }
      }

      // 3. Create StockTransaction (export) immediately
      if (data.warehouseId) {
        await tx.stockTransaction.create({
          data: {
            transactionCode: `EX-${orderCode}`,
            transactionType: 'export', // Enum
            warehouseId: data.warehouseId,
            referenceType: 'sales_order',
            referenceId: order.id,
            status: 'completed', // Xuất xong luôn
            totalValue: totalAmount, // Giá trị phiếu xuất
            notes: `Xuất bán lẻ đơn ${orderCode}`,
            createdBy: userId,
            details: {
              create: itemsWithCalculations.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice, // Lưu giá vốn hoặc giá bán tùy nghiệp vụ kho
                warehouseId: data.warehouseId,
              })),
            },
          },
        });
      }

      // 4. Update customer debt if payment is unpaid or partial
      if (order.paymentStatus !== 'paid') {
        const debtAmount = totalAmount - paidAmount;
        await tx.customer.update({
          where: { id: data.customerId },
          data: {
            currentDebt: {
              increment: debtAmount,
            },
            debtUpdatedAt: new Date(),
          },
        });
      }

      // 5. Create PaymentReceipt if payment > 0
      if (paidAmount > 0) {
        // Nếu đơn hàng là Credit/Installment -> Khoản trả trước mặc định coi là Tiền mặt (hoặc cần thêm field từ FE)
        // Nếu đơn hàng là Cash/Transfer -> Dùng đúng phương thức đó.
        let receiptPaymentMethod: 'cash' | 'transfer' | 'card' = 'cash';

        if (data.paymentMethod === 'transfer') {
          receiptPaymentMethod = 'transfer';
        }
        // Nếu data.paymentMethod là 'cash', 'installment', 'credit' -> code này sẽ fallback về 'cash'
        await tx.paymentReceipt.create({
          data: {
            receiptCode: `PT-${orderCode}`,
            receiptType: 'sales',
            customerId: data.customerId,
            orderId: order.id,
            amount: paidAmount,
            receiptDate: new Date(),
            paymentMethod: receiptPaymentMethod,
            isPosted: receiptPaymentMethod === 'cash' || receiptPaymentMethod === 'transfer',
            notes: `Thu tiền đơn hàng ${orderCode} (${
              data.paymentMethod === 'installment' ? 'Trả trước' : 'Thanh toán'
            })`,
            createdBy: userId,
          },
        });
      }

      return order;
    });

    logActivity('create', userId, 'sales_orders', {
      recordId: result.id,
      orderCode: result.orderCode,
    });

    await redis.flushPattern('sales-order:list:*');

    return result;
  }

  private async createDeliveryOrder(
    data: CreateSalesOrderInput,
    itemsWithCalculations: any[],
    orderCode: string,
    totalAmount: number,
    paidAmount: number,
    userId: number,
    inventoryShortages: any[]
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // Giai đoạn 1: Tạo đơn hàng (Hàng vẫn ở trong kho, chỉ dán tem "Đã bán")
      // 1. Create order with pending status
      const order = await tx.salesOrder.create({
        data: {
          orderCode,
          customerId: data.customerId,
          warehouseId: data.warehouseId,
          orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
          salesChannel: data.salesChannel || 'retail',
          totalAmount,
          discountAmount: data.discountAmount || 0,
          shippingFee: data.shippingFee || 0,
          taxAmount: 0,
          paidAmount,
          paymentMethod: data.paymentMethod,
          paymentStatus: paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
          orderStatus: 'pending',
          deliveryAddress: data.deliveryAddress,
          notes: data.notes,
          createdBy: userId,
          details: {
            create: itemsWithCalculations.map((item) => ({
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent || 0,
              taxRate: item.taxRate,
              notes: item.notes,
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

      // 2. Giữ hàng bằng reservedQuantity (xí chỗ, không trừ quantity)
      for (const item of data.items) {
        const warehouseId = item.warehouseId || data.warehouseId;
        if (warehouseId) {
          const inventory = await tx.inventory.findFirst({
            where: {
              productId: item.productId,
              warehouseId,
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                reservedQuantity: {
                  increment: item.quantity,
                },
                updatedBy: userId,
              },
            });
          }
        }
      }

      // 3. Tạo Delivery record
      const deliveryCode = await this.generateDeliveryCode(tx);
      const customer = order.customer;
      await tx.delivery.create({
        data: {
          deliveryCode,
          orderId: order.id,
          deliveryStaffId: userId,
          deliveryDate: new Date().toISOString().split('T')[0],
          deliveryStatus: 'pending',
          deliveryCost: 0,
          // Xử lý 3 trường hợp thanh toán: COD, Transfer trước, Credit
          // Case A: COD (Chưa thanh toán) -> codAmount = totalAmount
          // Case B: Transfer trước (Thanh toán rồi) -> codAmount = 0
          // Case C: Credit (Mua nợ) -> codAmount = 0
          codAmount: data.paymentMethod === 'cash' && paidAmount === 0 ? totalAmount : 0,
          settlementStatus: 'pending',
          notes: `Giao hàng cho khách ${data.recipientName || customer?.customerName} - ${
            data.recipientPhone || customer?.phone
          }`,
        },
      });

      // 4. Xử lý công nợ khách hàng (Case B & C: Nếu chưa trả hết tiền)
      if (order.paymentStatus !== 'paid') {
        const debtAmount = totalAmount - paidAmount;
        await tx.customer.update({
          where: { id: data.customerId },
          data: {
            currentDebt: {
              increment: debtAmount,
            },
            debtUpdatedAt: new Date(),
          },
        });
      }

      // 5. Tạo PaymentReceipt chỉ khi đã thanh toán trước (Case B: Transfer)
      // Case A: COD - Chưa tạo receipt (Tiền chưa về, Shipper ghi nhận)
      // Case C: Credit - Không tạo receipt (Ghi nợ)
      if (paidAmount > 0 && data.paymentMethod !== 'credit' && data.paymentMethod !== 'installment') {
        let receiptPaymentMethod: 'cash' | 'transfer' | 'card' = 'cash';

        if (data.paymentMethod === 'transfer') {
          receiptPaymentMethod = 'transfer';
        }
        
        await tx.paymentReceipt.create({
          data: {
            receiptCode: `PT-${orderCode}`,
            receiptType: 'sales',
            customerId: data.customerId,
            orderId: order.id,
            amount: paidAmount,
            receiptDate: new Date(),
            paymentMethod: receiptPaymentMethod,
            isPosted: receiptPaymentMethod === 'cash' || receiptPaymentMethod === 'transfer',
            notes: `Thu tiền đơn hàng ${orderCode} (Thanh toán trước)`,
            createdBy: userId,
          },
        });
      }

      return order;
    });

    logActivity('create', userId, 'sales_orders', {
      recordId: result.id,
      orderCode: result.orderCode,
    });

    await redis.flushPattern('sales-order:list:*');

    return {
      order: result,
      inventoryShortages: inventoryShortages.length > 0 ? inventoryShortages : undefined,
    };
  }

  async update(id: number, data: UpdateSalesOrderInput, userId: number) {
    const order = await prisma.salesOrder.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    if (order.orderStatus !== 'pending') {
      throw new ValidationError('Chỉ có thể cập nhật đơn hàng ở trạng thái chờ xử lý');
    }

    const updatedOrder = await prisma.salesOrder.update({
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

    logActivity('update', userId, 'sales_orders', {
      recordId: id,
      orderCode: order.orderCode,
      changes: data,
    });

    await redis.flushPattern('sales-order:list:*');
    await redis.del(`sales-order:${id}`);

    return updatedOrder;
  }

  async approve(id: number, userId: number, data?: ApproveOrderInput) {
    const order = await prisma.salesOrder.findUnique({
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

    const updatedOrder = await prisma.salesOrder.update({
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

    logActivity('update', userId, 'sales_orders', {
      recordId: id,
      action: 'approve_order',
      orderCode: order.orderCode,
    });

    await redis.flushPattern('sales-order:list:*');
    await redis.del(`sales-order:${id}`);

    return updatedOrder;
  }

  // Giai đoạn 2: Xuất kho giao Shipper (pending/preparing -> delivering)
  // Lúc này thủ kho đưa hàng cho Shipper. Hàng thực sự mất đi.
  async updateDeliveryStatus(id: number, userId: number, newStatus: 'preparing' | 'delivering') {
    const order = await prisma.salesOrder.findUnique({
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

        // Tạo StockTransaction (phiếu xuất kho)
        if (order.warehouseId) {
          await tx.stockTransaction.create({
            data: {
              transactionCode: `EX-${order.orderCode}`,
              transactionType: 'export',
              warehouseId: order.warehouseId,
              referenceType: 'sales_order',
              referenceId: order.id,
              status: 'completed',
              totalValue: Number(order.totalAmount),
              notes: `Xuất giao hàng đơn ${order.orderCode}`,
              createdBy: userId,
              details: {
                create: order.details.map((detail) => ({
                  productId: detail.productId,
                  quantity: detail.quantity,
                  unitPrice: detail.unitPrice,
                  warehouseId: detail.warehouseId || order.warehouseId,
                })),
              },
            },
          });
        }

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

      const updatedOrder = await tx.salesOrder.update({
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

    logActivity('update', userId, 'sales_orders', {
      recordId: id,
      action: `update_delivery_status_${newStatus}`,
      orderCode: order.orderCode,
    });

    await redis.flushPattern('sales-order:list:*');
    await redis.del(`sales-order:${id}`);

    return result;
  }

  async complete(id: number, userId: number) {
    const order = await prisma.salesOrder.findUnique({
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

      const updatedOrder = await tx.salesOrder.update({
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

    logActivity('update', userId, 'sales_orders', {
      recordId: id,
      action: 'complete_order',
      orderCode: order.orderCode,
    });

    await redis.flushPattern('sales-order:list:*');
    await redis.del(`sales-order:${id}`);

    return result;
  }

  async cancel(id: number, userId: number, data: CancelOrderInput) {
    const order = await prisma.salesOrder.findUnique({
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

      const updatedOrder = await tx.salesOrder.update({
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

    logActivity('update', userId, 'sales_orders', {
      recordId: id,
      action: 'cancel_order',
      orderCode: order.orderCode,
      reason: data.reason,
    });

    await redis.flushPattern('sales-order:list:*');
    await redis.del(`sales-order:${id}`);

    return result;
  }

  async processPayment(id: number, userId: number, data: ProcessPaymentInput) {
    const order = await prisma.salesOrder.findUnique({
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
      const updatedOrder = await tx.salesOrder.update({
        where: { id },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus,
          paymentMethod: data.paymentMethod,
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

    logActivity('update', userId, 'sales_orders', {
      recordId: id,
      action: 'process_payment',
      orderCode: order.orderCode,
      paidAmount: data.paidAmount,
    });

    await redis.flushPattern('sales-order:list:*');
    await redis.del(`sales-order:${id}`);

    return result;
  }

  async delete(id: number, userId: number) {
    const order = await prisma.salesOrder.findUnique({
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

      await tx.salesOrder.delete({
        where: { id },
      });
    });

    logActivity('delete', userId, 'sales_orders', {
      recordId: id,
      orderCode: order.orderCode,
    });

    await redis.flushPattern('sales-order:list:*');
    await redis.del(`sales-order:${id}`);

    return { message: 'Xóa đơn hàng bán thành công' };
  }

  async refresh() {
    // Clear all sales order cache
    await redis.flushPattern('sales-order:list:*');
    await redis.flushPattern('sales-order:*');

    return { message: 'Làm mới dữ liệu thành công' };
  }
}

export default new SalesOrderService();
