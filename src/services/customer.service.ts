import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import RedisService from './redis.service';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  UpdateCreditLimitInput,
  UpdateStatusInput,
  CustomerQueryInput,
} from '@validators/customer.validator';
import { sortedQuery } from '@utils/redis';

const prisma = new PrismaClient();
const redis = RedisService.getInstance();

const CUSTOMER_CACHE_TTL = 3600;
const CUSTOMER_LIST_CACHE_TTL = 600;

class CustomerService {
  async getAll(query: CustomerQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      customerType,
      classification,
      status,
      province,
      district,
      debtStatus,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // Tạo khóa cache cho nhất quán
    const cacheKey = `customer:list:${JSON.stringify(sortedQuery(query))}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`✅ Có cache: ${cacheKey}`);
      return cached;
    }

    console.log(`❌ Không có cache: ${cacheKey}, truy vấn database...`);

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(customerType && { customerType }),
      ...(classification && { classification }),
      ...(province && { province }),
      ...(district && { district }),
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
              salesOrders: true,
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
      byClassification: {
        retail: customerNoLimit.filter((customer) => customer.classification === 'retail').length,
        wholesale: customerNoLimit.filter((customer) => customer.classification === 'wholesale')
          .length,
        vip: customerNoLimit.filter((customer) => customer.classification === 'vip').length,
        distributor: customerNoLimit.filter((customer) => customer.classification === 'distributor')
          .length,
      },
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

    await redis.set(cacheKey, result, CUSTOMER_LIST_CACHE_TTL);

    return result;
  }

  async getById(id: number) {
    const cacheKey = `customer:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`✅ Có cache: ${cacheKey}`);
      return cached;
    }

    console.log(`❌ Không có cache: ${cacheKey}, truy vấn database...`);

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
        salesOrders: {
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

    await redis.set(cacheKey, customerWithDebtInfo, CUSTOMER_CACHE_TTL);

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
        classification: data.classification || 'retail',
        gender: data.gender,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email || null,
        address: data.address,
        province: data.province,
        district: data.district,
        taxCode: data.taxCode,
        cccd: data.cccd || null,
        issuedAt: data.issuedAt ? new Date(data.issuedAt) : null,
        issuedBy: data.issuedBy || null,
        creditLimit: data.creditLimit || 0,
        currentDebt: 0,
        rewardPoints: data.rewardPoints || 0,
        rewardCode: data.rewardCode || null,
        notes: data.notes,
        status: 'active',
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

    await redis.flushPattern('customer:list:*');

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
        ...(data.classification && { classification: data.classification }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson }),
        ...(data.phone && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.province !== undefined && { province: data.province }),
        ...(data.district !== undefined && { district: data.district }),
        ...(data.taxCode !== undefined && { taxCode: data.taxCode }),
        ...(data.cccd !== undefined && { cccd: data.cccd || null }),
        ...(data.issuedAt !== undefined && { issuedAt: data.issuedAt ? new Date(data.issuedAt) : null }),
        ...(data.issuedBy !== undefined && { issuedBy: data.issuedBy || null }),
        ...(data.creditLimit !== undefined && { creditLimit: data.creditLimit }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.rewardPoints !== undefined && { rewardPoints: data.rewardPoints }),
        ...(data.rewardCode !== undefined && { rewardCode: data.rewardCode || null }),
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

    await redis.del(`customer:${id}`);
    await redis.flushPattern('customer:list:*');

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

    await redis.del(`customer:${id}`);
    await redis.flushPattern('customer:list:*');

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

    await redis.del(`customer:${id}`);
    await redis.flushPattern('customer:list:*');

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
        salesOrders: {
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

    const unpaidOrders = customer.salesOrders.map((order) => ({
      ...order,
      debtAmount: Number(order.totalAmount) - Number(order.paidAmount),
    }));

    // Calculate total revenue and paid amounts
    const totalRevenue = customer.salesOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const totalPaid = customer.salesOrders.reduce((sum, order) => sum + Number(order.paidAmount), 0);

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
      totalOrders: customer.salesOrders.length,
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
        salesOrders: {
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
        unpaidOrdersCount: customer.salesOrders.length,
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
      prisma.salesOrder.findMany({
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
      prisma.salesOrder.count({ where: { customerId: id } }),
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
        salesOrders: true,
      },
    });

    if (!customer) {
      throw new NotFoundError('Không tìm thấy khách hàng');
    }

    if (Number(customer.currentDebt) > 0) {
      throw new ValidationError('Không thể xóa khách hàng khi còn công nợ');
    }

    if (customer.salesOrders.length > 0) {
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

    await redis.del(`customer:${id}`);
    await redis.flushPattern('customer:list:*');

    return { message: 'Xóa khách hàng thành công' };
  }
}

export default new CustomerService();
