import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import customerService from './customer.service';
import notificationService from './notification.service';
import promotionService from './promotion.service';
import smartDebtService from './smart-debt.service';
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
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Đếm TẤT CẢ invoice trong ngày (kể cả đã xoá mềm) để tránh trùng mã
    const count = await prisma.invoice.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    const sequence = (count + 1).toString().padStart(3, '0');
    const code = `DB-${dateStr}-${sequence}`;

    // Kiểm tra trùng code trước khi trả về (xử lý race condition)
    const existing = await prisma.invoice.findFirst({ where: { orderCode: code } });
    if (existing) {
      const sequence2 = (count + 2).toString().padStart(3, '0');
      return `DB-${dateStr}-${sequence2}`;
    }

    return code;
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
      deletedAt: null,
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
          details: {
            include: {
              product: {
                select: {
                  id: true,
                  code: true,
                  productName: true,
                  unit: true,
                },
              },
            },
          },
        },
        skip: offset,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.invoice.count({ where }),
    ]);

    const orderIds = orders.map(o => o.id);
    const refundTransactions = await prisma.stockTransaction.findMany({
      where: {
        referenceType: 'sale_refunds',
        referenceId: { in: orderIds },
        transactionType: 'import',
        isPosted: true,
        deletedAt: null
      },
      include: { details: true }
    });

    const ordersWithRemaining = orders.map((order) => {
      let refundedAmount = 0;
      const orderRefunds = refundTransactions.filter(rt => rt.referenceId === order.id);
      orderRefunds.forEach(receipt => {
        receipt.details.forEach(rd => {
          const invoiceItem = order.details.find(id => String(id.productId) === String(rd.productId));
          if (invoiceItem && Number(invoiceItem.quantity) > 0) {
            const itemEffectivePrice = Number(invoiceItem.total || 0) / Number(invoiceItem.quantity);
            refundedAmount += Number(rd.quantity || 0) * itemEffectivePrice;
          }
        });
      });

      return {
        ...order,
        refundedAmount,
        remainingAmount: Number(order.totalAmount) - Number(order.paidAmount) - refundedAmount,
      };
    });

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
      where: {
        id,
        createdBy: userId,
        deletedAt: null,
      },
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
    const [order, warehouseReceipts] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id, deletedAt: null },
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
            include: {
              deliveryStaff: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
          paymentReceipts: {
            where: { deletedAt: null },
            include: {
              creator: { select: { id: true, fullName: true, email: true } }
            }
          },
        },
      }),
      prisma.stockTransaction.findMany({
        where: {
          referenceType: { in: ['invoice', 'sale_refunds'] },
          referenceId: id,
          deletedAt: null
        },
        include: {
          details: true,
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    // Map stock transactions to the format expected by the frontend
    const mappedReceipts = warehouseReceipts.map(receipt => ({
      ...receipt,
      code: receipt.transactionCode,
      receiptDate: receipt.createdAt,
      receiptType: receipt.transactionType === 'import' ? 1 : 2, // 1: import, 2: export
      createdByUser: receipt.creator,
      status: receipt.isPosted ? 'posted' : 'draft'
    }));

    const result = {
      ...order,
      remainingAmount: Number(order.totalAmount) - Number(order.paidAmount),
      warehouseReceipts: mappedReceipts
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

    const productIds = Array.from(new Set(data.items.map((item) => Number(item.productId))));
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      const foundIds = products.map((p) => p.id);
      const missingIds = productIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundError(`Sản phẩm không đồng bộ. productIds: ${JSON.stringify(productIds)}, found: ${JSON.stringify(foundIds)}, missing: ${JSON.stringify(missingIds)}`);
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

    // Kiểm tra hạn mức công nợ khách hàng (Áp dụng cho mọi hình thức thanh toán nếu có hạn mức)
    const limit = Number(validatedCustomer?.creditLimit || 0);
    if (limit > 0) {
      const currentDebt = Number(validatedCustomer?.currentDebt || 0);
      const availableLimit = limit - currentDebt;
      
      if (totalAmount > availableLimit) {
        throw new ValidationError(
          `Khách hàng có hạn mức công nợ hiện tại không đủ. Tổng giá trị đơn hàng (${totalAmount.toLocaleString()} đ) vượt quá Hạn mức công nợ hiện tại (${availableLimit.toLocaleString()} đ). Yêu cầu kiểm tra và thay đổi giá trị đơn hàng hoặc nâng hạn mức công nợ.`
        );
      }
    }
    const orderCode = await this.generateOrderCode();

    // Không auto-complete khi tạo đơn, kể cả khi khách trả trước.
    // Đơn bán chỉ auto-complete khi có phiếu XK đầy đủ + thanh toán đủ (qua phiếu thu hoặc credit trả trước).
    // Logic auto-complete nằm trong checkAndCompleteOrder().
    let initialOrderStatus = data.requireApproval ? 'pending' : 'preparing';
    let paymentStatus = paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';
    let isFullyPrepaid = false;

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
        initialOrderStatus,
        paymentStatus,
        isFullyPrepaid
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
        initialOrderStatus,
        paymentStatus,
        isFullyPrepaid
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

    // ─── Auto-sync công nợ khách hàng ──────────────────────────────────────
    if (customerId) {
      this._autoSyncCustomerDebt(Number(customerId));
    }
    // ─────────────────────────────────────────────────────────────────────────

    return result;
  }

  /** Fire-and-forget: Tự động đồng bộ công nợ khách hàng vào bảng Smart Debt */
  private _autoSyncCustomerDebt(customerId: number) {
    const year = new Date().getFullYear();
    smartDebtService.syncSnap({ customerId, year }).catch((err) =>
      console.error(`[AutoSync] Failed to sync debt for customer ${customerId}:`, err.message)
    );
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
    initialOrderStatus: string,
    paymentStatus: string,
    isFullyPrepaid: boolean
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
        paidAmount: isFullyPrepaid ? totalAmount : paidAmount,
        paymentStatus: paymentStatus as any,
        orderStatus: initialOrderStatus as string as any,
        completedAt: initialOrderStatus === 'completed' ? new Date() : null,
        warehouseId: data.warehouseId ? Number(data.warehouseId) : null,
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
            gift: item.isGift || item.gift || false,
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

    // Cập nhật công nợ khách hàng
    // Nếu isFullyPrepaid, ta xem như đã "thanh toán" bằng cách trừ số dư trả trước.
    // Việc này tương đương với tăng currentDebt lên totalAmount (vì currentDebt đang là số âm)
    const debtAmount = totalAmount - (isFullyPrepaid ? 0 : paidAmount);
    if (debtAmount > 0 && Number(data.customerId) > 0) {
      await prisma.customer.update({
        where: { id: Number(data.customerId) },
        data: {
          currentDebt: {
            increment: debtAmount,
          },
          debtUpdatedAt: new Date(),
        },
      });
    }

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
    initialOrderStatus: string,
    paymentStatus: string,
    isFullyPrepaid: boolean
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
        paidAmount: isFullyPrepaid ? totalAmount : paidAmount,
        paymentStatus: paymentStatus as any,
        orderStatus: initialOrderStatus as string as any,
        completedAt: initialOrderStatus === 'completed' ? new Date() : null,
        warehouseId: data.warehouseId ? Number(data.warehouseId) : null,
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
            gift: item.isGift || item.gift || false,
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

    // Cập nhật công nợ khách hàng
    const debtAmount = totalAmount - (isFullyPrepaid ? 0 : paidAmount);
    if (debtAmount > 0 && Number(data.customerId) > 0) {
      await prisma.customer.update({
        where: { id: Number(data.customerId) },
        data: {
          currentDebt: {
            increment: debtAmount,
          },
          debtUpdatedAt: new Date(),
        },
      });
    }

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

    let customerId = data.customerId || order.customerId;
    let validatedCustomer: any = null;

    // Handle Customer logic (similar to create)
    if (data.customerId || data.newCustomer) {
      if (data.customerId) {
        validatedCustomer = await customerService.getById(Number(data.customerId));
        if (validatedCustomer.status !== 'active') {
          throw new ValidationError('Khách hàng phải ở trạng thái hoạt động để gán vào đơn hàng');
        }

        // If newCustomer data is provided while customerId exists, update the customer
        if (data.newCustomer) {
          await prisma.customer.update({
            where: { id: Number(data.customerId) },
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
        customerId = Number(data.customerId);
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
      }
    }

    const updatedOrder = await prisma.invoice.update({
      where: { id },
      data: {
        customerId,
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
      // Cập nhật Delivery status thành in_transit
      if (order.deliveries && order.deliveries.length > 0) {
        await tx.delivery.update({
          where: { id: order.deliveries[0].id },
          data: {
            deliveryStatus: 'in_transit',
          },
        });
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
      // Cập nhật Delivery status thành delivered
      if (order.deliveries && order.deliveries.length > 0) {
        await tx.delivery.update({
          where: { id: order.deliveries[0].id },
          data: {
            deliveryStatus: 'delivered',
          },
        });
      }

      await this.checkAndCompleteOrder(id, userId, tx);

      return await tx.invoice.findUnique({
        where: { id },
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

    // Auto-sync công nợ khách hàng sau khi hủy đơn
    if (order.customerId) {
      this._autoSyncCustomerDebt(order.customerId);
    }

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

    // Auto-sync công nợ khách hàng sau khi thanh toán
    if (order.customerId) {
      this._autoSyncCustomerDebt(order.customerId);
    }

    return result;
  }

  async delete(id: number, userId: number) {
    const order = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        details: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    if (order.orderStatus !== 'pending' && order.orderStatus !== 'cancelled') {
      throw new ValidationError('Chỉ có thể xóa đơn hàng ở trạng thái chờ xử lý hoặc đã hủy');
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });
    });

    logActivity('delete', userId, 'invoices', {
      recordId: id,
      orderCode: order.orderCode,
    });

    return { message: 'Xóa đơn hàng bán thành công' };
  }

  async bulkDelete(ids: number[], userId: number) {
    const orders = await prisma.invoice.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    if (orders.length !== ids.length) {
      throw new NotFoundError('Một hoặc nhiều đơn hàng không được tìm thấy hoặc đã bị xóa');
    }

    for (const order of orders) {
      if (order.orderStatus !== 'pending' && order.orderStatus !== 'cancelled') {
        throw new ValidationError('Chỉ có thể xóa các đơn hàng ở trạng thái chờ xử lý hoặc đã hủy');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.updateMany({
        where: { id: { in: ids } },
        data: {
          deletedAt: new Date(),
        },
      });
    });

    logActivity('delete', userId, 'invoices', {
      action: 'bulk_delete',
      orderCount: ids.length,
      orderIds: ids,
    });

    return { message: 'Xóa các đơn hàng đã chọn thành công' };
  }

  async revert(id: number, userId: number) {
    const order = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        paymentReceipts: {
          where: { deletedAt: null }
        },
        deliveries: {
          where: { deletedAt: null }
        }
      }
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng bán');
    }

    // Only allow reverting from non-final statuses back to pending
    if (order.orderStatus === 'completed' || order.orderStatus === 'cancelled') {
      throw new ValidationError(`Không thể chuyển trạng thái đơn hàng từ "${order.orderStatus}" về "chờ xác nhận"`);
    }

    // Check for existing payments
    if (order.paymentReceipts.length > 0) {
      throw new ValidationError('Không thể chuyển về "chờ xác nhận" vì đơn hàng đã có phiếu thu. Vui lòng xóa phiếu thu trước.');
    }

    // Check for existing deliveries
    if (order.deliveries.length > 0) {
      throw new ValidationError('Không thể chuyển về "chờ xác nhận" vì đơn hàng đã có phiếu giao hàng. Vui lòng xóa phiếu giao hàng trước.');
    }

    // Check for existing stock transactions (exports)
    const stockTransactions = await prisma.stockTransaction.count({
      where: {
        referenceType: 'invoice',
        referenceId: id,
        deletedAt: null
      }
    });

    if (stockTransactions > 0) {
      throw new ValidationError('Không thể chuyển về "chờ xác nhận" vì đơn hàng đã có phiếu xuất kho. Vui lòng xóa phiếu xuất kho trước.');
    }

    const updatedOrder = await prisma.invoice.update({
      where: { id },
      data: {
        orderStatus: 'pending',
        approvedBy: null,
        approvedAt: null,
      },
      include: {
        customer: true,
        creator: true,
      },
    });

    logActivity('update', userId, 'invoices', {
      recordId: id,
      action: 'revert_to_pending',
      orderCode: order.orderCode,
    });

    return updatedOrder;
  }

  async recheckStatus(invoiceId: number, userId: number) {
    const orderBefore = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { orderStatus: true, paymentStatus: true }
    });

    if (!orderBefore) {
      throw new NotFoundError('Không tìm thấy đơn hàng');
    }

    await prisma.$transaction(async (tx) => {
      await this.checkAndCompleteOrder(invoiceId, userId, tx);
    });

    const orderAfter = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { orderStatus: true, paymentStatus: true }
    });

    const changed = 
      orderBefore.orderStatus !== orderAfter?.orderStatus ||
      orderBefore.paymentStatus !== orderAfter?.paymentStatus;

    return {
      changed,
      before: orderBefore,
      after: orderAfter
    };
  }

  async checkAndCompleteOrder(invoiceId: number, userId: number, tx: Prisma.TransactionClient) {
    const order = await tx.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: {
        details: true,
        customer: true,
        deliveries: {
          where: { deletedAt: null }
        },
      },
    });

    if (!order) return;

    // Tính tổng tiền hoàn trả (refundedAmount)
    const refundTransactions = await tx.stockTransaction.findMany({
      where: {
        referenceType: 'sale_refunds',
        referenceId: invoiceId,
        isPosted: true,
        deletedAt: null,
      },
      include: {
        details: true,
      },
    });

    let refundedAmount = 0;
    for (const rt of refundTransactions) {
      for (const rd of rt.details) {
        const invoiceItem = order.details.find(id => id.productId === rd.productId);
        if (invoiceItem && Number(invoiceItem.quantity) > 0) {
          const itemEffectivePrice = Number(invoiceItem.total || 0) / Number(invoiceItem.quantity);
          refundedAmount += Number(rd.quantity) * itemEffectivePrice;
        }
      }
    }

    const customerDebt = Number(order.customer?.currentDebt || 0);
    const hasPrepaidCredit = customerDebt <= 0;
    const unpaidThisInvoice = Number(order.totalAmount) - Number(order.paidAmount) - refundedAmount;
    
    // Đơn hàng được coi là đã thanh toán nếu: 
    // 1. paymentStatus = 'paid'
    // 2. Hoặc khách hàng không còn nợ (hasPrepaidCredit)
    // 3. Hoặc số tiền trả + tiền hoàn hàng >= tổng tiền đơn hàng (unpaidThisInvoice <= 0)
    const isPaid = order.paymentStatus === 'paid' || hasPrepaidCredit || unpaidThisInvoice <= 0;

    // Condition 2: Fully Exported
    const stockTransactions = await tx.stockTransaction.findMany({
      where: {
        referenceType: 'invoice',
        referenceId: invoiceId,
        isPosted: true,
        deletedAt: null,
      },
      include: {
        details: true,
      },
    });

    const totalExported = new Map<number, number>();
    for (const st of stockTransactions) {
      for (const d of st.details) {
        const current = totalExported.get(d.productId) || 0;
        totalExported.set(d.productId, current + Number(d.quantity));
      }
    }

    let isFullyExported = true;
    for (const detail of order.details) {
      const exportedQty = totalExported.get(detail.productId) || 0;
      if (exportedQty < Number(detail.quantity)) {
        isFullyExported = false;
        break;
      }
    }

    // Condition 3: Delivered (if delivery order)
    let isDelivered = true;
    if (!order.isPickupOrder && order.deliveries.length > 0) {
      isDelivered = order.deliveries.every(d => d.deliveryStatus === 'delivered');
    }

    console.log(`[checkAndCompleteOrder] invoiceId: ${invoiceId}, isPaid: ${isPaid}, isFullyExported: ${isFullyExported}, isDelivered: ${isDelivered}`);
    console.log(`[checkAndCompleteOrder] paymentStatus: ${order.paymentStatus}, hasPrepaidCredit: ${hasPrepaidCredit}, unpaidThisInvoice: ${unpaidThisInvoice}`);

    if (isPaid && isFullyExported && isDelivered) {
      // Nếu hoàn thành nhờ trả trước, cập nhật paymentStatus và trừ công nợ
      const updateData: any = {
        orderStatus: 'completed',
        completedAt: new Date(),
      };

      if ((hasPrepaidCredit || unpaidThisInvoice <= 0) && order.paymentStatus !== 'paid') {
        updateData.paymentStatus = 'paid';
        // LƯU Ý: Không cập nhật paidAmount = totalAmount ở đây, để giữ nguyên số tiền thực tế khách đã trả.
        // Điều này đảm bảo hiển thị đúng "Đã thanh toán" và "Đã hoàn trả" trên UI.
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: updateData,
      });

      logActivity('update', userId, 'invoices', {
        recordId: invoiceId,
        action: 'auto_complete_order',
        orderCode: order.orderCode,
      });
    }
  }
}

export default new InvoiceService();
