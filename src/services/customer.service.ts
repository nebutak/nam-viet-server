import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  UpdateCreditLimitInput,
  UpdateStatusInput,
  CustomerQueryInput,
} from '@validators/customer.validator';

const prisma = new PrismaClient();

class CustomerService {
  async getAll(query: CustomerQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      customerType,
      status,
      debtStatus,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(customerType && { customerType }),
      ...(search && {
        OR: [
          { customerCode: { contains: search } },
          { customerName: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } },
          { taxCode: { contains: search } },
        ],
      }),
      // Handle debt status filter
      ...(debtStatus === 'with-debt' && { currentDebt: { gt: 0 } }),
      ...(debtStatus === 'no-debt' && { currentDebt: 0 }),
      ...(debtStatus === 'over-limit' && {
        AND: [
          { currentDebt: { gt: 0 } },
          { currentDebt: { gt: prisma.customer.fields.creditLimit } },
        ],
      }),
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
          updater: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
          _count: {
            select: {
              invoices: true,
            },
          },
        },
        skip: offset,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.customer.count({ where }),
    ]);

    const customersWithDebtInfo = customers.map((customer) => {
      const debtPercentage =
        Number(customer.creditLimit) > 0
          ? (Number(customer.currentDebt) / Number(customer.creditLimit)) * 100
          : 0;

      const isOverLimit = Number(customer.currentDebt) > Number(customer.creditLimit);
      const isNearLimit =
        Number(customer.currentDebt) >= Number(customer.creditLimit) * 0.8 &&
        Number(customer.currentDebt) <= Number(customer.creditLimit);

      return {
        ...customer,
        debtPercentage: Math.round(debtPercentage * 100) / 100,
        isOverLimit,
        isNearLimit,
      };
    });

    const customerNoLimit = await prisma.customer.findMany({
      where,
    });

    const thisMonth = new Date();
    thisMonth.setDate(1);
    const cards = {
      newThisMonth: customerNoLimit.filter((c) => new Date(c.createdAt) >= thisMonth).length,
      total: total,
      totalDebt: customerNoLimit.reduce(
        (total, customer) => total + Number(customer.currentDebt),
        0
      ),
      overLimit: customerNoLimit.filter(
        (customer) => Number(customer.currentDebt) > Number(customer.creditLimit)
      ).length,
    };

    const result = {
      data: customersWithDebtInfo,
      cards,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    return result;
  }

  async getById(id: number) {

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            email: true,
          },
        },
        updater: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            email: true,
          },
        },
        invoices: {
          select: {
            id: true,
            orderCode: true,
            orderDate: true,
            orderStatus: true,
            paymentStatus: true,
            totalAmount: true,
            paidAmount: true,
          },
          orderBy: {
            orderDate: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy khách hàng');
    }

    const debtPercentage =
      Number(customer.creditLimit) > 0
        ? (Number(customer.currentDebt) / Number(customer.creditLimit)) * 100
        : 0;

    const customerWithDebtInfo = {
      ...customer,
      debtPercentage: Math.round(debtPercentage * 100) / 100,
      isOverLimit: Number(customer.currentDebt) > Number(customer.creditLimit),
      isNearLimit:
        Number(customer.currentDebt) >= Number(customer.creditLimit) * 0.8 &&
        Number(customer.currentDebt) <= Number(customer.creditLimit),
      availableCredit:
        Number(customer.creditLimit) - Number(customer.currentDebt) > 0
          ? Number(customer.creditLimit) - Number(customer.currentDebt)
          : 0,
    };

    return customerWithDebtInfo;
  }

  async create(data: CreateCustomerInput, userId: number) {
    const existingCustomer = await prisma.customer.findUnique({
      where: { customerCode: data.customerCode },
    });

    if (existingCustomer) {
      throw new ConflictError('Mã khách hàng đã tồn tại');
    }

    const existingPhone = await prisma.customer.findFirst({
      where: { phone: data.phone },
    });

    if (existingPhone) {
      throw new ConflictError('Số điện thoại đã tồn tại');
    }

    if (data.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email: data.email },
      });

      if (existingEmail) {
        throw new ConflictError('Email đã tồn tại');
      }
    }

    if (data.taxCode && data.customerType === 'company') {
      const existingTaxCode = await prisma.customer.findFirst({
        where: { taxCode: data.taxCode },
      });

      if (existingTaxCode) {
        throw new ConflictError('Mã số thuế đã tồn tại');
      }
    }

    const customer = await prisma.customer.create({
      data: {
        customerCode: data.customerCode,
        customerName: data.customerName,
        customerType: data.customerType,
        classification: 'retail', // Keeping a default since DB schema might require it, but no longer exposed, or remove it entirely if db doesn't require it? Wait, let me check. I'll pass 'retail' to be safe since it's an enum. If it causes error, I'll update schema later.
        gender: data.gender,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email || null,
        address: data.address,
        taxCode: data.taxCode,
        cccd: data.cccd || null,
        issuedAt: data.issuedAt ? new Date(data.issuedAt) : null,
        issuedBy: data.issuedBy || null,
        creditLimit: data.creditLimit || 0,
        currentDebt: 0,
        rewardPoints: data.rewardPoints || 0,
        rewardCode: data.rewardCode || null,
        notes: data.notes,
        status: data.status || 'active',
        createdBy: userId,
      },
      include: {
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
      },
    });

    logActivity('create', userId, 'customers', {
      recordId: customer.id,
      customerCode: customer.customerCode,
    });

    return customer;
  }

  async update(id: number, data: UpdateCustomerInput, userId: number) {
    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy khách hàng');
    }

    if (data.phone && data.phone !== customer.phone) {
      const existingPhone = await prisma.customer.findFirst({
        where: {
          phone: data.phone,
          id: { not: id },
        },
      });

      if (existingPhone) {
        throw new ConflictError('Số điện thoại đã tồn tại');
      }
    }

    if (data.email && data.email !== customer.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: {
          email: data.email,
          id: { not: id },
        },
      });

      if (existingEmail) {
        throw new ConflictError('Email đã tồn tại');
      }
    }

    if (data.taxCode && data.taxCode !== customer.taxCode) {
      const existingTaxCode = await prisma.customer.findFirst({
        where: {
          taxCode: data.taxCode,
          id: { not: id },
        },
      });

      if (existingTaxCode) {
        throw new ConflictError('Mã số thuế đã tồn tại');
      }
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        ...(data.customerName && { customerName: data.customerName }),
        ...(data.customerType && { customerType: data.customerType }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson }),
        ...(data.phone && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.taxCode !== undefined && { taxCode: data.taxCode }),
        ...(data.cccd !== undefined && { cccd: data.cccd || null }),
        ...(data.issuedAt !== undefined && { issuedAt: data.issuedAt ? new Date(data.issuedAt) : null }),
        ...(data.issuedBy !== undefined && { issuedBy: data.issuedBy || null }),
        ...(data.creditLimit !== undefined && { creditLimit: data.creditLimit }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.rewardPoints !== undefined && { rewardPoints: data.rewardPoints }),
        ...(data.rewardCode !== undefined && { rewardCode: data.rewardCode || null }),
        ...(data.status !== undefined && { status: data.status }),
        updatedBy: userId,
      },
      include: {
        creator: true,
        updater: true,
      },
    });

    logActivity('update', userId, 'customers', {
      recordId: id,
      customerCode: customer.customerCode,
      changes: data,
    });

    return updatedCustomer;
  }

  async updateCreditLimit(id: number, data: UpdateCreditLimitInput, userId: number) {
    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy khách hàng');
    }

    if (data.creditLimit < Number(customer.currentDebt)) {
      throw new ValidationError(
        `Hạn mức tín dụng không được nhỏ hơn công nợ hiện tại (${customer.currentDebt})`
      );
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        creditLimit: data.creditLimit,
        notes: customer.notes
          ? `${customer.notes}\n[Cập nhật hạn mức] ${data.reason}`
          : `[Cập nhật hạn mức] ${data.reason}`,
        updatedBy: userId,
      },
    });

    logActivity('update', userId, 'customers', {
      recordId: id,
      action: 'update_credit_limit',
      oldValue: { creditLimit: customer.creditLimit },
      newValue: { creditLimit: data.creditLimit },
      reason: data.reason,
    });

    return updatedCustomer;
  }

  async updateStatus(id: number, data: UpdateStatusInput, userId: number) {
    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy khách hàng');
    }

    if (data.status === 'blacklisted' && Number(customer.currentDebt) > 0) {
      throw new ValidationError('Không thể đưa khách hàng vào danh sách đen khi còn công nợ');
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.reason
          ? customer.notes
            ? `${customer.notes}\n[Status: ${data.status}] ${data.reason}`
            : `[Status: ${data.status}] ${data.reason}`
          : customer.notes,
        updatedBy: userId,
      },
    });

    logActivity('update', userId, 'customers', {
      recordId: id,
      action: 'update_status',
      oldValue: { status: customer.status },
      newValue: { status: data.status },
      reason: data.reason,
    });

    return updatedCustomer;
  }

  async getDebtInfo(id: number) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        creditLimit: true,
        currentDebt: true,
        debtUpdatedAt: true,
        invoices: {
          where: {
            orderStatus: {
              in: ['pending', 'preparing', 'delivering', 'completed'],
            },
          },
          select: {
            id: true,
            orderCode: true,
            orderDate: true,
            totalAmount: true,
            paidAmount: true,
            orderStatus: true,
            paymentStatus: true,
          },
          orderBy: {
            orderDate: 'desc',
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy khách hàng');
    }

    const unpaidOrders = customer.invoices.map((order) => ({
      ...order,
      debtAmount: Number(order.totalAmount) - Number(order.paidAmount),
    }));

    // Calculate total revenue and paid amounts
    const totalRevenue = customer.invoices.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const totalPaid = customer.invoices.reduce((sum, order) => sum + Number(order.paidAmount), 0);

    const debtPercentage =
      Number(customer.creditLimit) > 0
        ? (Number(customer.currentDebt) / Number(customer.creditLimit)) * 100
        : 0;

    return {
      customerId: customer.id,
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      creditLimit: Number(customer.creditLimit),
      currentDebt: Number(customer.currentDebt),
      availableCredit: Math.max(0, Number(customer.creditLimit) - Number(customer.currentDebt)),
      debtPercentage: Math.round(debtPercentage * 100) / 100,
      isOverLimit: Number(customer.currentDebt) > Number(customer.creditLimit),
      isNearLimit:
        Number(customer.currentDebt) >= Number(customer.creditLimit) * 0.8 &&
        Number(customer.currentDebt) <= Number(customer.creditLimit),
      debtUpdatedAt: customer.debtUpdatedAt,
      unpaidOrders,
      totalUnpaidOrders: unpaidOrders.length,
      totalRevenue,
      totalOrders: customer.invoices.length,
      totalPaid,
    };
  }

  async getOverdueDebt() {
    const customers = await prisma.customer.findMany({
      where: {
        currentDebt: {
          gt: 0,
        },
        status: 'active',
      },
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        phone: true,
        currentDebt: true,
        creditLimit: true,
        debtUpdatedAt: true,
        invoices: {
          where: {
            orderStatus: {
              in: ['pending', 'preparing', 'delivering', 'completed'],
            },
          },
          select: {
            id: true,
            orderCode: true,
            orderDate: true,
            totalAmount: true,
            paidAmount: true,
          },
        },
      },
      orderBy: {
        currentDebt: 'desc',
      },
    });

    return customers.map((customer) => {
      const debtPercentage =
        Number(customer.creditLimit) > 0
          ? (Number(customer.currentDebt) / Number(customer.creditLimit)) * 100
          : 0;

      return {
        id: customer.id,
        customerCode: customer.customerCode,
        customerName: customer.customerName,
        phone: customer.phone,
        currentDebt: Number(customer.currentDebt),
        creditLimit: Number(customer.creditLimit),
        debtPercentage: Math.round(debtPercentage * 100) / 100,
        isOverLimit: Number(customer.currentDebt) > Number(customer.creditLimit),
        unpaidOrdersCount: customer.invoices.length,
        debtUpdatedAt: customer.debtUpdatedAt,
      };
    });
  }

  async getOrderHistory(id: number, page: number = 1, limit: number = 20) {
    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy khách hàng');
    }

    const offset = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { customerId: id },
        select: {
          id: true,
          orderCode: true,
          orderDate: true,
          orderStatus: true,
          paymentStatus: true,
          totalAmount: true,
          paidAmount: true,
          salesChannel: true,
          warehouse: {
            select: {
              id: true,
              warehouseName: true,
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { orderDate: 'desc' },
      }),
      prisma.invoice.count({ where: { customerId: id } }),
    ]);

    return {
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        customerName: customer.customerName,
      },
      orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async delete(id: number, userId: number) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: true,
      },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy khách hàng');
    }

    if (Number(customer.currentDebt) > 0) {
      throw new ValidationError('Không thể xóa khách hàng khi còn công nợ');
    }

    if (customer.invoices.length > 0) {
      throw new ValidationError(
        'Không thể xóa khách hàng có lịch sử đơn hàng. Hãy thay đổi trạng thái thành không hoạt động.'
      );
    }

    // soft delete
    await prisma.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    logActivity('delete', userId, 'customers', {
      recordId: id,
      customerCode: customer.customerCode,
    });

    return { message: 'Xóa khách hàng thành công' };
  }

  async getCustomerInvoices(query: any) {
    const { customerId, page = 1, limit = 10, dateFrom, dateTo, status, order } = query;
    const where: Prisma.InvoiceWhereInput = {
      customerId: Number(customerId),
      deletedAt: null,
      ...(dateFrom || dateTo
        ? {
            orderDate: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }
        : {}),
      ...(status && { paymentStatus: status as any }),
    };

    const offset = (Number(page) - 1) * Number(limit);
    let orderByConfig: any = { createdAt: 'desc' };
    try {
      if (order && typeof order === 'string') {
        const parsedOrder = JSON.parse(order);
        if (Array.isArray(parsedOrder) && parsedOrder[0]) {
          orderByConfig = { [parsedOrder[0][0]]: parsedOrder[0][1].toLowerCase() };
        }
      } else if (order) {
        orderByConfig = { [order[0][0]]: order[0][1].toLowerCase() };
      }
    } catch (e) {}

    const [orders, total, allOrdersForSummary] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip: offset,
        take: Number(limit),
        orderBy: orderByConfig,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        select: { totalAmount: true, paidAmount: true, paymentStatus: true, taxAmount: true, discountAmount: true },
      }),
    ]);

    const invoices = orders.map((o) => ({
      id: o.id,
      code: o.orderCode,
      date: o.orderDate,
      type: o.salesChannel,
      status: o.paymentStatus,
      subTotal: Number(o.totalAmount) - Number(o.taxAmount) + Number(o.discountAmount),
      taxAmount: Number(o.taxAmount),
      amount: Number(o.totalAmount),
      note: o.notes,
    }));

    const summary = allOrdersForSummary.reduce(
      (acc, curr) => {
        acc.subTotal += Number(curr.totalAmount);
        acc.amount += Number(curr.paidAmount);
        if (curr.paymentStatus === 'unpaid' || curr.paymentStatus === 'partial') {
          acc.pendingSubtotal += Number(curr.totalAmount) - Number(curr.paidAmount);
        }
        return acc;
      },
      { subTotal: 0, amount: 0, pendingSubtotal: 0 }
    );

    return { invoices, total, summary };
  }

  async getCustomerPurchasedProducts(query: any) {
    const customerId = Number(query.customerId);
    const details = await prisma.invoiceDetail.groupBy({
      by: ['productId'],
      where: {
        order: {
          customerId,
          deletedAt: null,
          orderStatus: { not: 'cancelled' },
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const productIds = details.map((d) => d.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, productName: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return details.map((d) => ({
      productId: d.productId,
      productName: productMap.get(d.productId)?.productName || `SP #${d.productId}`,
      totalQuantity: Number(d._sum.quantity || 0),
    }));
  }

  async getCustomerOverview(customerId: number) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    });
    
    if (!customer) throw new NotFoundError('Không tìm thấy khách hàng');

    const [ticketStats, taskStats, lastTask] = await Promise.all([
      prisma.ticket.groupBy({
        by: ['status'],
        where: { customerId: customer.id, deletedAt: null },
        _count: true
      }),
      prisma.crmTask.groupBy({
        by: ['status'],
        where: { customerId: customer.id, deletedAt: null },
        _count: true
      }),
      prisma.crmTask.findFirst({
        where: { customerId: customer.id, deletedAt: null },
        orderBy: { updatedAt: 'desc' }
      })
    ]);

    const ticketSummary = {
      total: ticketStats.reduce((sum, stat) => sum + stat._count, 0),
      byStatus: ticketStats.reduce((acc: any, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, { open: 0, in_progress: 0, resolved: 0, closed: 0 })
    };

    const taskSummary = {
      total: taskStats.reduce((sum, stat) => sum + stat._count, 0),
      byStatus: taskStats.reduce((acc: any, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, { pending: 0, in_progress: 0, completed: 0, cancelled: 0 })
    };

    const openTickets = ticketSummary.byStatus.open + ticketSummary.byStatus.in_progress;
    const pendingTasks = taskSummary.byStatus.pending + taskSummary.byStatus.in_progress;
    let lastCare = null;

    if (lastTask) {
      lastCare = {
        at: lastTask.updatedAt || lastTask.dueDate || lastTask.createdAt,
        sourceType: 'task',
        sourceId: lastTask.id
      };
    }

    return {
      customerId: customer.id,
      openTickets,
      pendingTasks,
      lastCare,
      ticketSummary,
      taskSummary
    };
  }

  async getCustomerTimeline(customerId: number, query: any) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    });
    
    if (!customer) throw new NotFoundError('Không tìm thấy khách hàng');

    const { page = 1, limit = 20, type = 'ALL' } = query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    let activities: any[] = [];
    let total = 0;

    // Fetch tickets
    if (type === 'ALL' || type === 'SUPPORT') {
      const tickets = await prisma.ticket.findMany({
        where: { customerId },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
          assignedTo: { select: { fullName: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      const ticketActivities = tickets.map(t => ({
        id: `ticket_${t.id}`,
        type: 'SUPPORT',
        title: `Hỗ trợ: ${t.title}`,
        description: `Trạng thái: ${t.status}, Mức độ: ${t.priority}`,
        date: t.createdAt,
        user: t.assignedTo?.fullName || 'Hệ thống'
      }));
      activities = [...activities, ...ticketActivities];
    }

    // Fetch tasks
    if (type === 'ALL' || type === 'INTERACTION') {
      const tasks = await prisma.crmTask.findMany({
        where: { customerId },
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          createdAt: true,
          assignedTo: { select: { fullName: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      const taskActivities = tasks.map(t => ({
        id: `task_${t.id}`,
        type: t.type === 'meeting' ? 'MEETING' : (t.type === 'call' ? 'CALL' : t.type.toUpperCase()),
        title: `Nhiệm vụ: ${t.title}`,
        description: `Loại: ${t.type}, Trạng thái: ${t.status}`,
        date: t.createdAt,
        user: t.assignedTo?.fullName || 'Hệ thống'
      }));
      activities = [...activities, ...taskActivities];
    }

    // Sort by date desc
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    total = activities.length;
    const paginatedActivities = activities.slice(offset, offset + limitNum);

    return {
      activities: paginatedActivities,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  }

  async importCustomers(items: any[], userId: number) {
    const errorItems: any[] = [];
    const operations: any[] = [];
    let currentMaxSequence = 0;

    // generate prefix KH + yyyyMMdd
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    const prefix = `KH${dateStr}`;

    const lastCustomer = await prisma.customer.findFirst({
      where: { customerCode: { startsWith: prefix } },
      orderBy: { customerCode: 'desc' },
    });

    if (lastCustomer && lastCustomer.customerCode) {
      const lastSequenceStr = lastCustomer.customerCode.slice(-3);
      if (!isNaN(Number(lastSequenceStr))) {
        currentMaxSequence = parseInt(lastSequenceStr, 10);
      }
    }

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = i + 2;

        const phone = item.phone?.trim() || null;
        const email = item.email?.trim() || null;
        const cccd = item.identityCard?.trim() || null;
        
        // Find existing to UPSERT
        let existingCustomer = null;
        if (cccd) {
            existingCustomer = await prisma.customer.findFirst({ where: { cccd } });
        }
        if (!existingCustomer && phone) {
            existingCustomer = await prisma.customer.findFirst({ where: { phone } });
            if (existingCustomer && existingCustomer.cccd && cccd && existingCustomer.cccd !== cccd) {
                errorItems.push({ row, errors: [{ field: 'CMND/CCCD', message: `Số điện thoại "${phone}" đã thuộc về khách hàng khác có CCCD: ${existingCustomer.cccd}.` }] });
                continue;
            }
        }

        const customerData = {
            customerType: item.customerType || 'individual',
            customerName: item.name.trim(),
            phone,
            email,
            address: item.address?.trim() || null,
            contactPerson: item.represent?.trim() || null,
            taxCode: item.taxCode?.trim() || null,
            cccd,
            issuedAt: item.identityDate ? new Date(item.identityDate) : null,
            issuedBy: item.identityPlace?.trim() || null,
            notes: item.note?.trim() || null,
            classification: item.classification?.trim() || 'retail',
            gender: item.gender || null,
            status: item.status || 'active',
            creditLimit: item.creditLimit ? new Prisma.Decimal(item.creditLimit) : new Prisma.Decimal(0),
        };

        if (existingCustomer) {
            if (phone && phone !== existingCustomer.phone) {
                const phoneConflict = await prisma.customer.findFirst({ where: { phone, id: { not: existingCustomer.id } } });
                if (phoneConflict) {
                    errorItems.push({ row, errors: [{ field: 'Số điện thoại', message: 'Số điện thoại đã được sử dụng bởi khách hàng khác.' }] });
                    continue;
                }
            }
            if (email && email !== existingCustomer.email) {
                const emailConflict = await prisma.customer.findFirst({ where: { email, id: { not: existingCustomer.id } } });
                if (emailConflict) {
                    errorItems.push({ row, errors: [{ field: 'Email', message: 'Email đã được sử dụng bởi khách hàng khác.' }] });
                    continue;
                }
            }
            operations.push({ type: 'update', data: { ...customerData, updatedBy: userId }, id: existingCustomer.id, row });
        } else {
            if (phone) {
                const phoneExists = await prisma.customer.findFirst({ where: { phone } });
                if (phoneExists) {
                    errorItems.push({ row, errors: [{ field: 'Số điện thoại', message: 'Số điện thoại đã tồn tại.' }] });
                    continue;
                }
            }
            if (email) {
                const emailExists = await prisma.customer.findFirst({ where: { email } });
                if (emailExists) {
                    errorItems.push({ row, errors: [{ field: 'Email', message: 'Email đã tồn tại.' }] });
                    continue;
                }
            }

            currentMaxSequence++;
            const code = `${prefix}${currentMaxSequence.toString().padStart(3, '0')}`;
            operations.push({ type: 'create', data: { ...customerData, customerCode: code, createdBy: userId, updatedBy: userId }, row });
        }
    }

    if (errorItems.length > 0) {
      const error = new Error('Validation failed') as any;
      error.importErrors = errorItems;
      throw error;
    }

    // Execute in transaction
    await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        if (op.type === 'create') {
          await tx.customer.create({ data: op.data });
        } else {
          await tx.customer.update({ where: { id: op.id }, data: op.data });
        }
      }
    });

    return { imported: operations.length };
  }
}

export default new CustomerService();
