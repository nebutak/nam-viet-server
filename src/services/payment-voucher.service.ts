import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
  CreatePaymentVoucherInput,
  UpdatePaymentVoucherInput,
  ApproveVoucherInput,
  PostVoucherInput,
  PaymentVoucherQueryInput,
} from '@validators/payment-voucher.validator';

const prisma = new PrismaClient();

class PaymentVoucherService {
  private async generateVoucherCode(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const count = await prisma.paymentVoucher.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    const sequence = (count + 1).toString().padStart(3, '0');
    return `PC-${dateStr}-${sequence}`;
  }

  async getAll(query: PaymentVoucherQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      supplierId,
      voucherType,
      paymentMethod,
      isPosted,
      approvalStatus,
      postedStatus,
      fromDate,
      toDate,
    } = query;

    const createdBy = (query as any).createdBy;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;


    // Xử lý approvalStatus
    let approvalStatusWhere: any = {};
    if (approvalStatus === 'approved') {
      approvalStatusWhere = { approvedBy: { not: null } };
    } else if (approvalStatus === 'pending') {
      approvalStatusWhere = { approvedBy: null };
    }

    // Xử lý postedStatus
    let postedStatusWhere: any = {};
    if (postedStatus === 'posted') {
      postedStatusWhere = { isPosted: true };
    } else if (postedStatus === 'draft') {
      postedStatusWhere = { isPosted: false };
    }

    const where: Prisma.PaymentVoucherWhereInput = {
      deletedAt: null,
      ...(supplierId && { supplierId }),
      ...(voucherType && { voucherType }),
      ...(paymentMethod && { paymentMethod }),
      ...(isPosted !== undefined && { isPosted }),
      ...(createdBy && { createdBy }),
      ...approvalStatusWhere,
      ...postedStatusWhere,
      ...(search && {
        OR: [
          { voucherCode: { contains: search } },
          { supplier: { supplierName: { contains: search } } },
          { expenseAccount: { contains: search } },
        ],
      }),
      ...(fromDate &&
        toDate && {
          paymentDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    };

    const [vouchers, total] = await Promise.all([
      prisma.paymentVoucher.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              supplierCode: true,
              supplierName: true,
              phone: true,
            },
          },
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
        },
        skip: offset,
        take: limitNum,
        orderBy: [
          // Đặt null (chờ duyệt) lên đầu bằng cách sort ASC
          { approvedAt: 'asc' }, // null ở đầu, sau đó tăng dần theo thời gian
          { isPosted: 'asc' }, // false (chưa ghi sổ) trước true
          { createdAt: 'desc' }, // mới nhất trên
        ],
      }),
      prisma.paymentVoucher.count({ where }),
    ]);

    const sortedData = vouchers.sort((a, b) => {
      // Ưu tiên 1: approvedAt null lên đầu
      if (a.approvedAt === null && b.approvedAt !== null) return -1;
      if (a.approvedAt !== null && b.approvedAt === null) return 1;

      // Ưu tiên 2: Nếu cả 2 đã duyệt, sắp xếp theo isPosted (false trước true)
      if (a.approvedAt !== null && b.approvedAt !== null) {
        if (a.isPosted === false && b.isPosted === true) return -1;
        if (a.isPosted === true && b.isPosted === false) return 1;
      }

      // Ưu tiên 3: Mới nhất lên đầu
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Stat Cards
    const allVouchers = await prisma.paymentVoucher.findMany({
      where,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        approvedBy: true,
        isPosted: true,
      },
    });

    const totalAmount = allVouchers.reduce((sum, v) => sum + Number(v.amount), 0);
    const cashAmount = allVouchers
      .filter((v) => v.paymentMethod === 'cash')
      .reduce((sum, v) => sum + Number(v.amount), 0);
    const transferAmount = allVouchers
      .filter((v) => v.paymentMethod === 'transfer')
      .reduce((sum, v) => sum + Number(v.amount), 0);

    const approvedVouchers = allVouchers.filter((v) => v.approvedBy).length;
    const pendingVouchers = allVouchers.filter((v) => !v.approvedBy).length;
    const postedVouchers = allVouchers.filter((v) => v.isPosted).length;

    const pendingAmount = allVouchers
      .filter((v) => !v.approvedBy)
      .reduce((sum, v) => sum + Number(v.amount), 0);

    const statistics = {
      totalVouchers: allVouchers.length,
      totalAmount,
      cashAmount,
      transferAmount,
      approvedVouchers,
      pendingVouchers,
      pendingAmount,
      postedVouchers,
    };

    const result = {
      data: sortedData,
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

  async getMyPayments(userId: number, query: PaymentVoucherQueryInput) {
    return this.getAll({ ...query, createdBy: userId } as any);
  }

  async getById(id: number) {

    const voucher = await prisma.paymentVoucher.findUnique({
      where: { id },
      include: {
        supplier: {
          select: {
            id: true,
            supplierCode: true,
            supplierName: true,
            phone: true,
            email: true,
            address: true,
            taxCode: true,
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
            email: true,
          },
        },
      },
    });

    if (!voucher) {
      throw new NotFoundError('Phiếu chi không tìm thấy');
    }

    return voucher;
  }

  async create(data: CreatePaymentVoucherInput, userId: number) {
    if (data.supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: data.supplierId },
      });

      if (!supplier) {
        throw new NotFoundError('Nhà cung cấp không tìm thấy');
      }

      if (supplier.status !== 'active') {
        throw new ValidationError('Nhà cung cấp phải ở trạng thái hoạt động');
      }
    }

    if (data.paymentMethod === 'transfer') {
      if (!data.bankName) {
        throw new ValidationError('Tên ngân hàng là bắt buộc đối với thanh toán chuyển khoản');
      }
    }

    const voucherCode = await this.generateVoucherCode();

    const voucher = await prisma.paymentVoucher.create({
      data: {
        voucherCode,
        voucherType: data.voucherType,
        supplierId: data.supplierId,
        expenseAccount: data.expenseAccount,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        bankName: data.bankName,
        paymentDate: new Date(data.paymentDate),
        notes: data.notes,
        isPosted: false,
        createdBy: userId,
      },
      include: {
        supplier: true,
        creator: true,
      },
    });

    logActivity('create', userId, 'payment_vouchers', {
      recordId: voucher.id,
      voucherCode: voucher.voucherCode,
      amount: data.amount,
    });

    return voucher;
  }

  async update(id: number, data: UpdatePaymentVoucherInput, userId: number) {
    const voucher = await prisma.paymentVoucher.findUnique({
      where: { id },
    });

    if (!voucher) {
      throw new NotFoundError('Phiếu chi không tìm thấy');
    }

    if (voucher.isPosted) {
      throw new ValidationError('Không thể cập nhật phiếu chi đã ghi sổ');
    }

    if (voucher.approvedBy) {
      throw new ValidationError('Không thể cập nhật phiếu chi đã được duyệt');
    }

    // Validate supplier if changed
    if (data.supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: data.supplierId },
      });

      if (!supplier) {
        throw new NotFoundError('Nhà cung cấp không tìm thấy');
      }

      if (supplier.status !== 'active') {
        throw new ValidationError('Nhà cung cấp phải ở trạng thái hoạt động');
      }
    }

    if (data.paymentMethod === 'transfer') {
      if (!data.bankName && !voucher.bankName) {
        throw new ValidationError('Tên ngân hàng là bắt buộc đối với thanh toán chuyển khoản');
      }
    }

    const updatedVoucher = await prisma.paymentVoucher.update({
      where: { id },
      data: {
        ...(data.voucherType && { voucherType: data.voucherType }),
        ...(data.supplierId !== undefined && { supplierId: data.supplierId }),
        ...(data.expenseAccount !== undefined && { expenseAccount: data.expenseAccount }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.paymentMethod && { paymentMethod: data.paymentMethod }),
        ...(data.bankName !== undefined && { bankName: data.bankName }),
        ...(data.paymentDate && { paymentDate: new Date(data.paymentDate) }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        supplier: true,
        creator: true,
      },
    });

    logActivity('update', userId, 'payment_vouchers', {
      recordId: id,
      voucherCode: voucher.voucherCode,
      changes: data,
    });

    return updatedVoucher;
  }

  async approve(id: number, userId: number, data?: ApproveVoucherInput) {
    const voucher = await prisma.paymentVoucher.findUnique({
      where: { id },
    });

    if (!voucher) {
      throw new NotFoundError('Phiếu chi không tìm thấy');
    }

    if (voucher.isPosted) {
      throw new ValidationError('Không thể duyệt phiếu chi đã ghi sổ');
    }

    if (voucher.approvedBy) {
      throw new ValidationError('Phiếu chi đã được duyệt rồi');
    }

    // Approve: Chỉ cập nhật approvedBy và approvedAt
    // KHÔNG cập nhật cash_fund, suppliers, hay salary
    // Vì đây chỉ là "phê duyệt trên giấy", chưa chi tiền thực tế
    const updatedPayment = await prisma.paymentVoucher.update({
      where: { id },
      data: {
        approvedBy: userId,
        approvedAt: new Date(),
        notes: data?.notes ? `${voucher.notes || ''}\n${data.notes}` : voucher.notes,
      },
      include: {
        supplier: true,
        creator: true,
        approver: true,
      },
    });

    logActivity('update', userId, 'payment_vouchers', {
      recordId: id,
      action: 'approve_voucher',
      voucherCode: voucher.voucherCode,
    });

    return updatedPayment;
  }

  async post(id: number, userId: number, data?: PostVoucherInput) {
    const voucher = await prisma.paymentVoucher.findUnique({
      where: { id },
      include: { supplier: true },
    });

    if (!voucher) {
      throw new NotFoundError('Phiếu chi không tìm thấy');
    }

    if (voucher.isPosted) {
      throw new ValidationError('Phiếu chi đã ghi sổ rồi');
    }

    if (!voucher.approvedBy) {
      throw new ValidationError('Phiếu chi phải được duyệt trước khi ghi sổ');
    }

    // Transaction: Cập nhật toàn bộ dữ liệu liên quan
    const updatedVoucher = await prisma.$transaction(async (tx) => {
      // 1. Cập nhật payment_voucher: isPosted = true
      const posted = await tx.paymentVoucher.update({
        where: { id },
        data: {
          isPosted: true,
          notes: data?.notes ? `${voucher.notes || ''}\n[POSTED] ${data.notes}` : voucher.notes,
        },
        include: {
          supplier: true,
          creator: true,
          approver: true,
        },
      });

      // 2. Cập nhật cash_fund (Quỹ tiền mặt) - ĐÃ LOẠI BỎ THEO YÊU CẦU
      /*
      const start = new Date(voucher.paymentDate);
      ...
      */


      // 3. Cập nhật suppliers (Trừ nợ NCC) - Nếu là supplier_payment
      if (voucher.voucherType === 'supplier_payment' && voucher.supplierId) {
        const supplier = await tx.supplier.findUnique({
          where: { id: voucher.supplierId },
        });

        if (supplier) {
          const newTotalPayable = Math.max(0, Number(supplier.totalPayable || 0) - Number(voucher.amount));
          await tx.supplier.update({
            where: { id: voucher.supplierId },
            data: {
              totalPayable: newTotalPayable,
            },
          });
        }
      }

      // 4. Cập nhật salary (Đánh dấu lương đã chi) - Nếu là salary
      if (voucher.voucherType === 'salary') {
        // Tìm bảng lương tương ứng theo tháng/năm của paymentDate
        // Format: YYYYMM (e.g., 202601 for Jan 2026)
        const paymentDate = new Date(voucher.paymentDate);
        const month = String(paymentDate.getFullYear()) + String(paymentDate.getMonth() + 1).padStart(2, '0');

        await tx.salary.updateMany({
          where: {
            month: month,
            status: { not: 'paid' }, // Chỉ update những cái chưa chi
          },
          data: {
            status: 'paid',
            isPosted: true,
            paidBy: userId,
            paymentDate: paymentDate,
          },
        });
      }

      return posted;
    });

    logActivity('update', userId, 'payment_vouchers', {
      recordId: id,
      action: 'post_voucher',
      voucherCode: voucher.voucherCode,
    });

    return updatedVoucher;
  }

  async delete(id: number, userId: number) {
    const voucher = await prisma.paymentVoucher.findUnique({
      where: { id },
    });

    if (!voucher) {
      throw new NotFoundError('Phiếu chi không tìm thấy');
    }

    if (voucher.isPosted) {
      throw new ValidationError('Không thể xóa phiếu chi đã ghi sổ');
    }

    if (voucher.approvedBy) {
      throw new ValidationError('Không thể xóa phiếu chi đã được duyệt');
    }

    // soft delete
    await prisma.paymentVoucher.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    logActivity('delete', userId, 'payment_vouchers', {
      recordId: id,
      voucherCode: voucher.voucherCode,
    });

    return { message: 'Xóa phiếu chi thành công' };
  }

  async unpost(id: number, userId: number) {
    const voucher = await prisma.paymentVoucher.findUnique({
      where: { id },
      include: {
        supplier: true,
      },
    });

    if (!voucher) {
      throw new NotFoundError('Phiếu chi không tồn tại');
    }

    if (!voucher.isPosted) {
      throw new ValidationError('Phiếu chi chưa được ghi sổ');
    }

    // Bỏ ghi sổ (cập nhật isPosted về false)
    const updatedVoucher = await prisma.paymentVoucher.update({
      where: { id },
      data: {
        isPosted: false,
      },
      include: {
        creator: {
          select: { id: true, fullName: true, employeeCode: true },
        },
        approver: {
          select: { id: true, fullName: true, employeeCode: true },
        },
        supplier: {
          select: {
            id: true,
            supplierCode: true,
            supplierName: true,
          },
        },
      },
    });

    logActivity('unpost', userId, 'payment_vouchers', {
      recordId: id,
      voucherCode: voucher.voucherCode,
    });

    return updatedVoucher;
  }

  async getBySupplier(supplierId: number) {
    const vouchers = await prisma.paymentVoucher.findMany({
      where: { supplierId },
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
      },
      orderBy: {
        paymentDate: 'desc',
      },
    });

    return vouchers;
  }

  async getStatistics(fromDate?: string, toDate?: string) {
    const where: Prisma.PaymentVoucherWhereInput = {
      ...(fromDate &&
        toDate && {
          paymentDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    };

    // Get all vouchers in period (including pending and unposted)
    const vouchers = await prisma.paymentVoucher.findMany({
      where,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        approvedBy: true,
        isPosted: true,
      },
    });

    const totalAmount = vouchers.reduce((sum, v) => sum + Number(v.amount), 0);
    const cashAmount = vouchers
      .filter((v) => v.paymentMethod === 'cash')
      .reduce((sum, v) => sum + Number(v.amount), 0);
    const transferAmount = vouchers
      .filter((v) => v.paymentMethod === 'transfer')
      .reduce((sum, v) => sum + Number(v.amount), 0);

    const approvedVouchers = vouchers.filter((v) => v.approvedBy).length;
    const pendingVouchers = vouchers.filter((v) => !v.approvedBy).length;
    const postedVouchers = vouchers.filter((v) => v.isPosted).length;

    const pendingAmount = vouchers
      .filter((v) => !v.approvedBy)
      .reduce((sum, v) => sum + Number(v.amount), 0);

    return {
      totalVouchers: vouchers.length,
      totalAmount,
      cashAmount,
      transferAmount,
      approvedVouchers,
      pendingVouchers,
      pendingAmount,
      postedVouchers,
    };
  }

  async getSummary(fromDate?: string, toDate?: string) {
    const where: Prisma.PaymentVoucherWhereInput = {
      isPosted: true,
      ...(fromDate &&
        toDate && {
          paymentDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    };

    const vouchers = await prisma.paymentVoucher.findMany({
      where,
      select: {
        voucherType: true,
        paymentMethod: true,
        amount: true,
      },
    });

    const totalAmount = vouchers.reduce((sum, v) => sum + Number(v.amount), 0);

    const byType = vouchers.reduce((acc, v) => {
      acc[v.voucherType] = (acc[v.voucherType] || 0) + Number(v.amount);
      return acc;
    }, {} as Record<string, number>);

    const byMethod = vouchers.reduce((acc, v) => {
      acc[v.paymentMethod] = (acc[v.paymentMethod] || 0) + Number(v.amount);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalVouchers: vouchers.length,
      totalAmount,
      byType,
      byMethod,
    };
  }

  async getExpenseReport(fromDate: string, toDate: string) {
    const vouchers = await prisma.paymentVoucher.findMany({
      where: {
        isPosted: true,
        paymentDate: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
      },
      include: {
        supplier: {
          select: {
            id: true,
            supplierCode: true,
            supplierName: true,
          },
        },
      },
      orderBy: {
        paymentDate: 'desc',
      },
    });

    const summary = {
      totalExpense: vouchers.reduce((sum, v) => sum + Number(v.amount), 0),
      byType: vouchers.reduce((acc, v) => {
        if (!acc[v.voucherType]) {
          acc[v.voucherType] = {
            count: 0,
            amount: 0,
            vouchers: [],
          };
        }
        acc[v.voucherType].count += 1;
        acc[v.voucherType].amount += Number(v.amount);
        acc[v.voucherType].vouchers.push({
          id: v.id,
          voucherCode: v.voucherCode,
          amount: v.amount,
          paymentDate: v.paymentDate,
          supplier: v.supplier,
          expenseAccount: v.expenseAccount,
        });
        return acc;
      }, {} as Record<string, any>),
    };

    return {
      fromDate,
      toDate,
      summary,
      vouchers,
    };
  }
  async bulkPost(ids: number[], userId: number) {
    // Lấy tất cả phiếu cần ghi sổ
    const vouchers = await prisma.paymentVoucher.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      include: { supplier: true },
    });

    // Validate tất cả phiếu
    for (const voucher of vouchers) {
      if (voucher.isPosted) {
        throw new ValidationError(`Phiếu chi ${voucher.voucherCode} đã ghi sổ rồi`);
      }

      if (!voucher.approvedBy) {
        throw new ValidationError(`Phiếu chi ${voucher.voucherCode} phải được duyệt trước khi ghi sổ`);
      }
    }

    // Transaction: Ghi sổ tất cả phiếu
    const result = await prisma.$transaction(async (tx) => {
      for (const voucher of vouchers) {
        // 1. Cập nhật payment_voucher: isPosted = true
        await tx.paymentVoucher.update({
          where: { id: voucher.id },
          data: {
            isPosted: true,
            notes: voucher.notes ? `${voucher.notes}\n[BULK POSTED]` : '[BULK POSTED]',
          },
        });

        // 2. Cập nhật cash_fund (Quỹ tiền mặt) - ĐÃ LOẠI BỎ THEO YÊU CẦU
        /*
        const start = new Date(voucher.paymentDate);
        ... (legacy code)
        */


        // 3. Cập nhật supplier debt (nếu là supplier_payment)
        if (voucher.voucherType === 'supplier_payment' && voucher.supplier) {
          await tx.supplier.update({
            where: { id: voucher.supplier.id },
            data: {
              totalPayable: {
                decrement: voucher.amount,
              },
            },
          });
        }
      }

      logActivity('bulkPost', userId, 'payment_vouchers', {
        count: ids.length,
        ids: ids,
      });

      return {
        message: `Ghi sổ ${ids.length} phiếu chi thành công`,
        count: ids.length,
      };
    });

    return result;
  }

}

export default new PaymentVoucherService();
