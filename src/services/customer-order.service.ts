import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@utils/errors';
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
      items: orderData.items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitId: item.unitId || null,
        notes: item.notes || '',
      })),
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
