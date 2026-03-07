import { prisma } from '@config/prisma';
import { BadRequestError, NotFoundError } from '@utils/errors';
import { addMonths } from 'date-fns';

export class ExpiryService {
  constructor() {}

  calculateMonthsDifference(startDate: Date, endDate: Date) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const endYear = end.getFullYear();
    const endMonth = end.getMonth();

    const monthDifference = (endYear - startYear) * 12 + (endMonth - startMonth);
    return Math.max(monthDifference, 0);
  }

  accountMapping(accounts: any[]) {
    return accounts.map((account) => {
      const expiries = Array.isArray(account.expiries) ? account.expiries : [];
      if (!expiries.length) {
        return account;
      }

      const updatedExpiries = expiries.map((expiry: any) => {
        const { startDate, endDate } = expiry;

        if (!startDate || !endDate) {
          return {
            ...expiry,
            months: 0,
          };
        }

        const months = this.calculateMonthsDifference(startDate, endDate);
        return {
          ...expiry,
          months,
        };
      });

      return {
        ...account,
        expiries: updatedExpiries,
      };
    });
  }

  async getAllAccountsWithExpiries() {
    const accounts = await prisma.customerExpiryAccount.findMany({
      include: {
        customer: true,
        expiries: {
          orderBy: { endDate: 'desc' },
          include: {
            product: {
              include: {
                category: true,
              },
            },
            invoice: true,
            user: {
              select: { id: true, fullName: true, email: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return this.accountMapping(accounts);
  }

  async getExpiryById(id: number) {
    const expiry = await prisma.expiry.findUnique({
      where: { id },
      include: {
        account: {
          include: {
            customer: true,
          },
        },
        product: {
          include: {
            category: true,
          },
        },
        invoice: true,
        user: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
      },
    });

    if (!expiry) {
      throw new NotFoundError('Hạn sử dụng không tồn tại');
    }

    return expiry;
  }

  async createAccount(data: any) {
    const { accountName, customerId, accountCreatedAt } = data;
    try {
      const account = await prisma.customerExpiryAccount.create({
        data: {
          accountName,
          customerId,
          accountCreatedAt: accountCreatedAt ? new Date(accountCreatedAt) : null,
        },
      });
      return account.id;
    } catch (error: any) {
      throw new BadRequestError(error.message);
    }
  }

  async deleteAccount(accountId: number) {
    const account = await prisma.customerExpiryAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundError('Tài khoản không tồn tại');
    }
    await prisma.customerExpiryAccount.delete({ where: { id: accountId } });
    return true;
  }

  async createExpiry(data: any, creatorId: number) {
    const {
      customerId,
      accountId = null,
      accountName = null,
      startDate,
      invoiceId,
      productId,
      alertDateStep = 30,
      options,
      note,
      months,
      userId,
    } = data;

    let invoice = null;
    if (invoiceId) {
      invoice = await prisma.invoice.findUnique({ where: { orderCode: invoiceId } });
      if (!invoice) throw new BadRequestError(`Không tìm thấy hóa đơn ${invoiceId}`);
    }

    const product = productId ? await prisma.product.findUnique({ where: { id: productId }, include: { category: true } }) : null;
    const category = product?.category?.categoryName || 'other';

    let newAccountId = accountId;

    if (!accountId && accountName) {
      const existingName = await prisma.customerExpiryAccount.findFirst({
        where: { accountName },
      });

      if (existingName) {
        throw new BadRequestError('Tài khoản đã tồn tại');
      }

      newAccountId = await this.createAccount({ customerId, accountName, accountCreatedAt: startDate });
    }

    if (accountId) {
      const isInvalid = await prisma.expiry.findFirst({
        where: {
          accountId,
          endDate: { gte: new Date(startDate) },
        },
      });

      if (isInvalid) {
        throw new BadRequestError('Ngày bắt đầu phải lớn hơn ngày kết thúc của các khoảng cũ');
      }
    }

    const start = new Date(startDate);
    const endDate = addMonths(start, months || 1);
    endDate.setDate(endDate.getDate() - 1);

    const expiryPayload = {
      accountId: newAccountId,
      startDate: start,
      endDate,
      category,
      invoiceId: invoice?.id || null,
      productId: productId || null,
      alertDateStep,
      note,
      userId: userId || null,
      createdBy: creatorId,
      options: options || [],
    };

    try {
      return await prisma.expiry.create({ data: expiryPayload });
    } catch (error: any) {
      throw new BadRequestError(error.message);
    }
  }

  async updateExpiry(id: number, data: any, updaterId: number) {
    const {
      accountId,
      accountName,
      startDate,
      invoiceId,
      alertDateStep = 30,
      options,
      note,
      months,
      userId,
      productId,
    } = data;

    const account = await prisma.customerExpiryAccount.findUnique({
      where: { id: accountId },
      include: { expiries: true },
    });

    if (!account) throw new NotFoundError('Không tìm thấy tài khoản');

    const isExistedAccountName = await prisma.customerExpiryAccount.findFirst({
      where: {
        id: { not: accountId },
        accountName,
      },
    });

    if (isExistedAccountName) throw new BadRequestError('Tài khoản đã tồn tại');

    const expiry = await prisma.expiry.findFirst({
      where: { id, accountId },
    });

    if (!expiry) throw new NotFoundError('Không tìm thấy hạn dùng');

    const isInvalid = await prisma.expiry.findFirst({
      where: {
        accountId,
        endDate: { gte: new Date(startDate) },
        id: { not: id },
      },
    });

    if (isInvalid) throw new BadRequestError('Ngày bắt đầu phải lớn hơn ngày kết thúc của các khoảng cũ');

    let invoice = null;
    if (invoiceId) {
      invoice = await prisma.invoice.findUnique({ where: { orderCode: invoiceId } });
      if (!invoice) throw new BadRequestError(`Không tìm thấy hóa đơn ${invoiceId}`);
    }

    const product = productId ? await prisma.product.findUnique({ where: { id: productId }, include: { category: true } }) : null;
    const category = product?.category?.categoryName || 'other';

    const start = new Date(startDate);
    const endDate = addMonths(start, months || 1);
    endDate.setDate(endDate.getDate() - 1);

    const accountDataToUpdate: any = { accountName };
    if (account.expiries.length === 1) {
      accountDataToUpdate.accountCreatedAt = start;
    }

    await prisma.$transaction(async (tx) => {
      await tx.customerExpiryAccount.update({
        where: { id: accountId },
        data: accountDataToUpdate,
      });

      await tx.expiry.update({
        where: { id },
        data: {
          startDate: start,
          endDate,
          category,
          productId: productId || null,
          invoiceId: invoice?.id || null,
          alertDateStep,
          note,
          userId: userId || null,
          updatedBy: updaterId,
          options: options || [],
        },
      });

      await tx.expiry.updateMany({
        where: {
          accountId,
          id: { not: id },
        },
        data: {
          productId: productId || null,
        },
      });
    });

    return true;
  }

  async deleteExpiry(id: number) {
    const expiry = await prisma.expiry.findUnique({ where: { id } });
    if (!expiry) throw new NotFoundError('Hạn sử dụng không tồn tại');
    await prisma.expiry.delete({ where: { id } });
    return true;
  }

  async getAccountsByCustomerId(customerId: number, page = 1, limit = 30) {
    const offset = (page - 1) * limit;

    const [count, accounts] = await prisma.$transaction([
      prisma.customerExpiryAccount.count({ where: { customerId } }),
      prisma.customerExpiryAccount.findMany({
        where: { customerId },
        include: {
          customer: true,
          expiries: {
            orderBy: { endDate: 'desc' },
            include: {
              product: {
                include: { category: true },
              },
              invoice: true,
              user: {
                select: { id: true, fullName: true, email: true, avatarUrl: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return {
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      accounts: this.accountMapping(accounts),
    };
  }
}

export default ExpiryService;
