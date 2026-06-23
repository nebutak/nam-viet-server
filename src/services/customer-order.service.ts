import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import invoiceService from './invoice.service';

const prisma = new PrismaClient();

class CustomerOrderService {
  // Create an order from customer portal
  async createOrder(orderData: any, customerId: number) {
    // 1. Fetch customer details to get default shipping info and sales manager
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy thông tin khách hàng');
    }

    // 1.5. Automatically check inventory stock to confirm order creation
    let itemsWithPrices: any[] = [];
    if (orderData.items && Array.isArray(orderData.items)) {
      const productIds = orderData.items.map((item: any) => Number(item.productId));
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, productName: true, price: true }
      });

      // Group item quantities by productId to handle duplicates correctly
      const productQuantities: Record<number, number> = {};
      for (const item of orderData.items) {
        const pid = Number(item.productId);
        productQuantities[pid] = (productQuantities[pid] || 0) + Number(item.quantity);
      }

      // Check stock for each product
      for (const [productIdStr, requestedQty] of Object.entries(productQuantities)) {
        const productId = Number(productIdStr);
        const product = products.find(p => p.id === productId);

        if (!product) {
          throw new NotFoundError(`Sản phẩm với ID ${productId} không tồn tại`);
        }

        // Sum available quantity across all active warehouses
        const inventories = await prisma.inventory.findMany({
          where: {
            productId,
            warehouse: {
              status: 'active',
            },
          },
        });

        const totalAvailable = inventories.reduce(
          (sum, inv) => sum + (Number(inv.quantity) - Number(inv.reservedQuantity)),
          0
        );

        if (totalAvailable < requestedQty) {
          throw new ValidationError(
            `Sản phẩm "${product.productName}" không đủ hàng trong kho (Còn lại: ${totalAvailable}, Yêu cầu: ${requestedQty})`
          );
        }
      }

      // Map items with unitPrice looked up from database to prevent price tampering
      itemsWithPrices = orderData.items.map((item: any) => {
        const product = products.find(p => p.id === Number(item.productId));
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitId: item.unitId || null,
          notes: item.notes || '',
          unitPrice: product ? Number(product.price || 0) : 0,
        };
      });
    }

    // 2. Map payload to CreateInvoiceInput expected by invoiceService
    const createInvoiceInput = {
      customerId: customer.id,
      isPickupOrder: false, // Online orders are delivery orders
      paymentMethod: orderData.paymentMethod || 'cash',
      paidAmount: 0, // Online orders are paid on delivery or transfer later
      deliveryAddress: orderData.deliveryAddress || customer.address || '',
      recipientName: orderData.recipientName || customer.customerName,
      recipientPhone: orderData.recipientPhone || customer.phone,
      notes: orderData.notes || '',
      items: itemsWithPrices,
      promotionId: orderData.promotionId || null,
      requireApproval: true, // Online customer orders always require admin approval
    };

    // 3. Find attributed staff user (salesperson assigned to customer, customer creator, or default to user 1)
    const staffUserId = customer.assignedUserId || customer.createdBy || 1;

    // 4. Delegate to existing invoice service
    return await invoiceService.create(createInvoiceInput as any, staffUserId);
  }

  // Get orders history for the authenticated customer
  async getOrders(customerId: number, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const offset = (page - 1) * limit;

    const where = {
      customerId,
      deletedAt: null,
      ...(query.orderStatus && { orderStatus: query.orderStatus }),
      ...(query.paymentStatus && { paymentStatus: query.paymentStatus }),
      ...(query.search && {
        orderCode: { contains: query.search },
      }),
    };

    const [orders, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          details: {
            include: {
              product: {
                select: {
                  id: true,
                  code: true,
                  productName: true,
                  image: true,
                  unit: true,
                },
              },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      data: orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get order details for a specific order belonging to the customer
  async getOrderDetails(orderId: number, customerId: number) {
    const order = await prisma.invoice.findFirst({
      where: {
        id: orderId,
        customerId,
        deletedAt: null,
      },
      include: {
        details: {
          include: {
            product: {
              select: {
                id: true,
                code: true,
                productName: true,
                image: true,
                unit: true,
              },
            },
          },
        },
        paymentReceipts: {
          where: { deletedAt: null },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Không tìm thấy đơn hàng hoặc đơn hàng không thuộc về bạn');
    }

    return order;
  }
}

export default new CustomerOrderService();
