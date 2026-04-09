import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
  CreatePaymentVoucherInput,
  UpdatePaymentVoucherInput,
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
      status,
      fromDate,
      toDate,
    } = query;

    const createdBy = (query as any).createdBy;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const where: Prisma.PaymentVoucherWhereInput = {
      deletedAt: null,
      ...(supplierId && { supplierId }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.employeeId && { employeeId: query.employeeId }),
      ...(voucherType && { voucherType }),
      ...(paymentMethod && { paymentMethod }),
      ...(status && { status }),
      ...(createdBy && { createdBy }),
      ...(search && {
        OR: [
          { voucherCode: { contains: search } },
          { supplier: { supplierName: { contains: search } } },
          { customer: { customerName: { contains: search } } },
          { employee: { fullName: { contains: search } } },
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
          customer: {
            select: {
              id: true,
              customerCode: true,
              customerName: true,
              phone: true,
            },
          },
          employee: {
            select: {
              id: true,
              employeeCode: true,
              fullName: true,
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
        },
        skip: offset,
        take: limitNum,
        orderBy: [
          { createdAt: 'desc' }, // mới nhất trên
        ],
      }),
      prisma.paymentVoucher.count({ where }),
    ]);

    // Stat Cards
    const allVouchers = await prisma.paymentVoucher.findMany({
      where,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        status: true,
      },
    });

    const totalAmount = allVouchers.reduce((sum, v) => sum + Number(v.amount), 0);
    const cashAmount = allVouchers
      .filter((v) => v.paymentMethod === 'cash')
      .reduce((sum, v) => sum + Number(v.amount), 0);
    const transferAmount = allVouchers
      .filter((v) => v.paymentMethod === 'transfer')
      .reduce((sum, v) => sum + Number(v.amount), 0);

    const draftVouchers = allVouchers.filter((v) => v.status === 'draft').length;
    const postedVouchers = allVouchers.filter((v) => v.status === 'posted').length;
    const cancelledVouchers = allVouchers.filter((v) => v.status === 'cancelled').length;

    const draftAmount = allVouchers
      .filter((v) => v.status === 'draft')
      .reduce((sum, v) => sum + Number(v.amount), 0);

    const statistics = {
      totalVouchers: allVouchers.length,
      totalAmount,
      cashAmount,
      transferAmount,
      draftVouchers,
      postedVouchers,
      draftAmount,
      cancelledVouchers
    };

    const result = {
      data: vouchers,
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
        customer: {
          select: {
            id: true,
            customerCode: true,
            customerName: true,
            phone: true,
            email: true,
            address: true,
            taxCode: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            phone: true,
            email: true,
            address: true,
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
        purchaseOrder: {
          include: {
            details: {
              include: {
                product: true,
              }
            }
          }
        }
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
        customerId: data.customerId,
        employeeId: data.employeeId,
        purchaseOrderId: data.purchaseOrderId,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        bankName: data.bankName,
        paymentDate: new Date(data.paymentDate),
        reason: data.reason,
        notes: data.notes,
        status: 'draft',
        createdBy: userId,
      },
      include: {
        supplier: true,
        customer: true,
        employee: true,
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

    if (voucher.status !== 'draft') {
      throw new ValidationError('Chỉ có thể cập nhật phiếu chi ở trạng thái nháp');
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
        supplierId: data.supplierId !== undefined ? data.supplierId : undefined,
        customerId: data.customerId !== undefined ? data.customerId : undefined,
        employeeId: data.employeeId !== undefined ? data.employeeId : undefined,
        purchaseOrderId: data.purchaseOrderId !== undefined ? data.purchaseOrderId : undefined,
        amount: data.amount !== undefined ? data.amount : undefined,
        ...(data.paymentMethod && { paymentMethod: data.paymentMethod }),
        ...(data.bankName !== undefined && { bankName: data.bankName }),
        ...(data.paymentDate && { paymentDate: new Date(data.paymentDate) }),
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        supplier: true,
        customer: true,
        employee: true,
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

  async post(id: number, userId: number, data?: PostVoucherInput) {
    const voucher = await prisma.paymentVoucher.findUnique({
      where: { id },
      include: { supplier: true },
    });

    if (!voucher) {
      throw new NotFoundError('Phiếu chi không tìm thấy');
    }

    if (voucher.status === 'posted') {
      throw new ValidationError('Phiếu chi đã ghi sổ rồi');
    }
    
    if (voucher.status === 'cancelled') {
        throw new ValidationError('Không thể ghi sổ phiếu chi đã hủy');
    }

    // Transaction: Cập nhật toàn bộ dữ liệu liên quan
    const updatedVoucher = await prisma.$transaction(async (tx) => {
      // 1. Cập nhật payment_voucher: status = 'posted'
      const posted = await tx.paymentVoucher.update({
        where: { id },
        data: {
          status: 'posted',
          postedAt: new Date(),
          notes: data?.notes ? `${voucher.notes || ''}\n[POSTED] ${data.notes}` : voucher.notes,
        },
        include: {
          supplier: true,
          creator: true,
        },
      });

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

      // 3.5 Cập nhật PurchaseOrder (nếu có)
      if (voucher.purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({ where: { id: voucher.purchaseOrderId } });
        if (po) {
          const newPaidAmount = Number(po.paidAmount) + Number(voucher.amount);
          const totalAmount = Number(po.totalAmount);
          let paymentStatus = 'partial';
          if (newPaidAmount >= totalAmount) paymentStatus = 'paid';
          if (newPaidAmount <= 0) paymentStatus = 'unpaid';
          
          await tx.purchaseOrder.update({
            where: { id: po.id },
            data: {
              paidAmount: newPaidAmount,
              paymentStatus: paymentStatus as any,
            }
          });
        }
      }

      // 4. Cập nhật salary (Đánh dấu lương đã chi) - Nếu là salary
      if (voucher.voucherType === 'salary') {
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

    if (!['draft', 'cancelled'].includes(voucher.status)) {
      throw new ValidationError('Chỉ có thể xóa phiếu chi ở trạng thái nháp hoặc đã hủy');
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

  async cancel(id: number, userId: number, data?: PostVoucherInput) {
    const voucher = await prisma.paymentVoucher.findUnique({
      where: { id },
      include: {
        supplier: true,
      },
    });

    if (!voucher) {
      throw new NotFoundError('Phiếu chi không tồn tại');
    }

    if (voucher.status === 'cancelled') {
        throw new ValidationError('Phiếu chi đã được hủy từ trước');
    }

    // Nếu đã ghi sổ thì phải hoàn tác
    const updatedVoucher = await prisma.$transaction(async (tx) => {
        if (voucher.status === 'posted') {
            // Hoàn tác công nợ nhà cung cấp
            if (voucher.voucherType === 'supplier_payment' && voucher.supplierId) {
                const supplier = await tx.supplier.findUnique({
                  where: { id: voucher.supplierId },
                });
        
                if (supplier) {
                  const newTotalPayable = Number(supplier.totalPayable || 0) + Number(voucher.amount);
                  await tx.supplier.update({
                    where: { id: voucher.supplierId },
                    data: {
                      totalPayable: newTotalPayable,
                    },
                  });
                }
              }

              // Hoàn tác Purchase Order (nếu có)
              if (voucher.purchaseOrderId) {
                const po = await tx.purchaseOrder.findUnique({ where: { id: voucher.purchaseOrderId } });
                if (po) {
                  const newPaidAmount = Math.max(0, Number(po.paidAmount) - Number(voucher.amount));
                  let paymentStatus = 'partial';
                  if (newPaidAmount <= 0) paymentStatus = 'unpaid';
                  else if (newPaidAmount >= Number(po.totalAmount)) paymentStatus = 'paid';
                  
                  await tx.purchaseOrder.update({
                    where: { id: po.id },
                    data: {
                      paidAmount: newPaidAmount,
                      paymentStatus: paymentStatus as any,
                    }
                  });
                }
              }

              // Hoàn tác lương
              if (voucher.voucherType === 'salary') {
                const paymentDate = new Date(voucher.paymentDate);
                const month = String(paymentDate.getFullYear()) + String(paymentDate.getMonth() + 1).padStart(2, '0');
        
                await tx.salary.updateMany({
                  where: {
                    month: month,
                    status: 'paid',
                  },
                  data: {
                    status: 'approved',
                    isPosted: false,
                    paidBy: null,
                    paymentDate: null,
                  },
                });
              }
        }
        
        // Hủy (cập nhật status về cancelled)
        return await tx.paymentVoucher.update({
            where: { id },
            data: {
                status: 'cancelled',
                cancelledAt: new Date(),
                notes: data?.notes ? `${voucher.notes || ''}\n[CANCELLED] ${data.notes}` : voucher.notes,
            },
            include: {
                creator: {
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
    })

    logActivity('update', userId, 'payment_vouchers', {
      recordId: id,
      action: 'cancel_voucher',
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

    const vouchers = await prisma.paymentVoucher.findMany({
      where,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        status: true,
      },
    });

    const totalAmount = vouchers.reduce((sum, v) => sum + Number(v.amount), 0);
    const cashAmount = vouchers
      .filter((v) => v.paymentMethod === 'cash')
      .reduce((sum, v) => sum + Number(v.amount), 0);
    const transferAmount = vouchers
      .filter((v) => v.paymentMethod === 'transfer')
      .reduce((sum, v) => sum + Number(v.amount), 0);

    const draftVouchers = vouchers.filter((v) => v.status === 'draft').length;
    const postedVouchers = vouchers.filter((v) => v.status === 'posted').length;
    const cancelledVouchers = vouchers.filter((v) => v.status === 'cancelled').length;

    const draftAmount = vouchers
      .filter((v) => v.status === 'draft')
      .reduce((sum, v) => sum + Number(v.amount), 0);

    return {
      totalVouchers: vouchers.length,
      totalAmount,
      cashAmount,
      transferAmount,
      draftVouchers,
      postedVouchers,
      draftAmount,
      cancelledVouchers
    };
  }

  async getSummary(fromDate?: string, toDate?: string) {
    const where: Prisma.PaymentVoucherWhereInput = {
      status: 'posted',
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
        status: 'posted',
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
    const vouchers = await prisma.paymentVoucher.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      include: { supplier: true },
    });

    for (const voucher of vouchers) {
      if (voucher.status === 'posted') {
        throw new ValidationError(`Phiếu chi ${voucher.voucherCode} đã ghi sổ rồi`);
      }
      if (voucher.status === 'cancelled') {
        throw new ValidationError(`Không thể ghi sổ phiếu chi đã hủy (${voucher.voucherCode})`);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const voucher of vouchers) {
        await tx.paymentVoucher.update({
          where: { id: voucher.id },
          data: {
            status: 'posted',
            postedAt: new Date(),
            notes: voucher.notes ? `${voucher.notes}\n[BULK POSTED]` : '[BULK POSTED]',
          },
        });

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
