import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, AuthorizationError } from '@utils/errors';
import customerService from './customer.service';
import {
  CreateCustomerInvoiceInput,
  CustomerCancelOrderInput,
} from '@validators/cs-invoice.validator';
import { InvoiceQueryInput } from '@validators/invoice.validator';

const prisma = new PrismaClient();
const MAX_ORDER_AMOUNT = 30000000; // 30 Triệu

class CustomerInvoiceService {
  // ========================================================
  // HELPER: Sinh mã đơn & QR (Giữ nguyên như cũ)
  // ========================================================
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
    return `DH-OL-${dateStr}-${sequence}`;
  }

  private generatePaymentInfo(orderCode: string, amount: number, methodDetail?: string) {
    const content = `${orderCode}`;

    if (methodDetail === 'MOMO_QR') {
      return {
        type: 'MOMO',
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=MOMO:${orderCode}:${amount}`,
        amount,
        content,
        instructions: 'Mở App MoMo và quét mã QR.',
      };
    }
    if (methodDetail === 'MBBANK_QR' || methodDetail === 'BANK_TRANSFER') {
      return {
        type: 'BANK_TRANSFER',
        bankName: 'MB Bank',
        accountNo: '88888888888',
        accountName: 'CONG TY ABC',
        qrCode: `https://img.vietqr.io/image/MB-88888888888-compact2.png?amount=${amount}&addInfo=${content}`,
        amount,
        content,
        instructions: 'Quét mã bằng App Ngân hàng.',
      };
    }
    return null;
  }

  private async checkOrderOwnership(customerId: number, orderId: number) {
    const order = await prisma.invoice.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Đơn hàng không tồn tại');
    if (order.customerId !== customerId) throw new AuthorizationError('Không có quyền truy cập');
    return order;
  }

  // ========================================================
  // 1. CREATE ORDER (Logic Kết hợp: Bảo mật Khách + Tồn kho Admin)
  // ========================================================
  async createOrder(customerId: number, data: CreateCustomerInvoiceInput) {
    // --- PHẦN 1: VALIDATE (Logic của Khách) ---
    const customer = await customerService.getById(customerId);
    if (customer.status !== 'active')
      throw new ValidationError('Tài khoản khách hàng không hoạt động.');

    if (data.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({ where: { id: data.warehouseId } });
      if (!warehouse || warehouse.status !== 'active')
        throw new ValidationError('Kho hàng không khả dụng.');
    }

    // Lấy sản phẩm (Bảo mật giá: Lấy từ DB)
    const productIds = data.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, status: 'active' },
      // Lấy giá bán lẻ niêm yết từ DB
      select: { id: true, productName: true, sellingPriceRetail: true, taxRate: true },
    });

    if (products.length !== productIds.length) {
      throw new ValidationError('Một số sản phẩm không hợp lệ.');
    }

    // --- PHẦN 2: KIỂM TRA TỒN KHO (Logic của Admin - COPY CHÍNH XÁC) ---
    // Sử dụng đúng logic tính toán của Admin để đảm bảo đồng nhất
    const inventoryShortages = [];

    for (const item of data.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;

      const warehouseId = item.warehouseId || data.warehouseId;
      if (warehouseId) {
        // [LOGIC ADMIN] Tìm inventory record
        const inventory = await prisma.inventory.findFirst({
          where: {
            productId: item.productId,
            warehouseId,
          },
        });

        // [LOGIC ADMIN] Tính available = quantity - reservedQuantity
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

    if (inventoryShortages.length > 0) {
      throw new ValidationError('Kho không đủ hàng.', { shortages: inventoryShortages });
    }

    // --- PHẦN 3: TÍNH TIỀN (Logic Bảo mật) ---
    let subtotal = 0;
    let totalTaxAmount = 0;

    const itemsWithCalculations = data.items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const price = Number(product.sellingPriceRetail); // Dùng giá DB
      const taxRate = Number(product.taxRate || 0);

      const lineTotal = item.quantity * price;
      const taxAmount = lineTotal * (taxRate / 100);

      subtotal += lineTotal;
      totalTaxAmount += taxAmount;

      return {
        productId: item.productId,
        warehouseId: item.warehouseId || data.warehouseId,
        quantity: item.quantity,
        unitPrice: price, // Giá DB
        discountPercent: 0,
        taxRate: taxRate,
        notes: item.notes,
      };
    });

    const shippingFee = data.shippingFee || 0;
    const discountAmount = data.discountAmount || 0;
    const totalAmount = subtotal + totalTaxAmount + shippingFee - discountAmount;

    if (totalAmount > MAX_ORDER_AMOUNT) {
      throw new ValidationError(
        `Đơn hàng vượt quá hạn mức thanh toán Online (${MAX_ORDER_AMOUNT.toLocaleString()}).`
      );
    }

    const orderCode = await this.generateOrderCode();

    // --- PHẦN 4: TRANSACTION & UPDATE KHO (Logic của Admin - COPY CHÍNH XÁC) ---
    const result = await prisma.$transaction(async (tx) => {
      // A. Tạo Order (Ép status an toàn)
      const order = await tx.invoice.create({
        data: {
          orderCode,
          customerId,
          warehouseId: data.warehouseId,
          orderDate: new Date(),
          salesChannel: 'online', // Cố định
          totalAmount,
          discountAmount,
          shippingFee,
          taxAmount: totalTaxAmount,
          paidAmount: 0, // Mặc định 0
          paymentMethod: data.paymentMethod,
          paymentStatus: 'unpaid', // Mặc định unpaid
          orderStatus: 'pending', // Mặc định pending
          deliveryAddress: data.deliveryAddress || customer.address,
          notes: data.notes,
          createdBy: 1,
          details: {
            create: itemsWithCalculations,
          },
        },
        include: { details: true },
      });

      // B. [LOGIC ADMIN] Cập nhật tồn kho (Reserved)
      // Copy chính xác logic vòng lặp update của Admin để tránh sai lệch
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
                  increment: item.quantity, // Tăng lượng đặt trước
                },
                updatedBy: null, // Log người sửa là khách
              },
            });
          }
          // Admin logic không xử lý case inventory null ở đoạn update này, ta giữ nguyên
        }
      }

      return order;
    });

    // --- PHẦN 5: TRẢ VỀ & QR CODE ---
    let paymentInfo = null;
    if (data.paymentMethod === 'transfer') {
      paymentInfo = this.generatePaymentInfo(
        result.orderCode,
        totalAmount,
        data.paymentMethodDetail
      );
    }

    return {
      success: true,
      order: result,
      paymentInfo,
    };
  }

  // ========================================================
  // 2. GET MY ORDERS (Giữ nguyên - Độc lập)
  // ========================================================
  async getMyOrders(query: InvoiceQueryInput) {
    // Logic lấy danh sách đơn của riêng khách hàng
    const { customerId, page = 1, limit = 20, orderStatus, fromDate, toDate } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Prisma.InvoiceWhereInput = {
      customerId: customerId,
      ...(orderStatus && {
        orderStatus: Array.isArray(orderStatus) ? { in: orderStatus } : orderStatus,
      }),
      ...(fromDate &&
        toDate && {
          orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
        }),
    };

    const [orders, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          details: { select: { productId: true, quantity: true, unitPrice: true } },
          warehouse: { select: { warehouseName: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      data: orders,
      meta: { page, limit, total, totalPages: Math.ceil(total / Number(limit)) },
    };
  }

  // ========================================================
  // 3. CANCEL ORDER (Giữ nguyên - Độc lập nhưng logic trả kho giống Admin)
  // ========================================================
  async customerCancelOrder(orderId: number, customerId: number, data: CustomerCancelOrderInput) {
    const order = await this.checkOrderOwnership(customerId, orderId);

    if (order.orderStatus !== 'pending') {
      throw new ValidationError('Không thể hủy đơn hàng đã được xử lý.');
    }

    await prisma.$transaction(async (tx) => {
      // [LOGIC ADMIN] Trả tồn kho (Decrement Reserved)
      // Lặp qua details để trả hàng
      const details = await tx.invoiceDetail.findMany({ where: { orderId } });

      for (const detail of details) {
        if (detail.warehouseId) {
          const inventory = await tx.inventory.findFirst({
            where: { productId: detail.productId, warehouseId: detail.warehouseId },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                reservedQuantity: {
                  decrement: detail.quantity, // Giảm lượng đặt trước
                },
                updatedBy: null,
              },
            });
          }
        }
      }

      // Cập nhật trạng thái
      await tx.invoice.update({
        where: { id: orderId },
        data: {
          orderStatus: 'cancelled',
          cancelledBy: null,
          cancelledAt: new Date(),
          notes: `${order.notes || ''}\n[KHÁCH HỦY]: ${data.reason}`,
        },
      });
    });

    return { message: 'Đã hủy đơn hàng thành công.' };
  }

  // ========================================================
  // 4. GET ORDER DETAIL
  // ========================================================
  async getOrderDetail(customerId: number, orderId: number) {
    // 1. Chỉ gọi để kiểm tra quyền sở hữu (nếu sai sẽ throw lỗi ngay tại đây)
    await this.checkOrderOwnership(customerId, orderId);

    // 2. Lấy chi tiết đầy đủ
    const fullOrder = await prisma.invoice.findUnique({
      where: { id: orderId },
      include: {
        details: {
          include: {
            product: { select: { id: true, productName: true, sku: true, unit: true } },
          },
        },
        warehouse: { select: { warehouseName: true, address: true } },
      },
    });

    // Tính số tiền còn lại phải trả
    const remaining = Number(fullOrder?.totalAmount || 0) - Number(fullOrder?.paidAmount || 0);

    return {
      ...fullOrder,
      remainingAmount: Math.max(0, remaining),
    };
  }

  // ========================================================
  // 5. INITIATE PAYMENT (Thanh toán lại)
  // ========================================================
  async initiatePayment(customerId: number, orderId: number, data: any) {
    const order = await this.checkOrderOwnership(customerId, orderId);

    if (order.paymentStatus === 'paid') {
      throw new ValidationError('Đơn hàng đã được thanh toán đầy đủ.');
    }

    const remaining = Number(order.totalAmount) - Number(order.paidAmount);
    const amountToPay = data.amount || remaining; // Nếu không gửi amount thì thanh toán hết

    // Sinh lại QR Code
    const paymentInfo = this.generatePaymentInfo(
      order.orderCode,
      amountToPay,
      data.paymentMethodDetail
    );

    if (!paymentInfo) {
      throw new ValidationError('Phương thức thanh toán không hỗ trợ sinh mã online.');
    }

    return {
      orderCode: order.orderCode,
      ...paymentInfo,
    };
  }
}

export default new CustomerInvoiceService();
