import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import customerService from './customer.service';
import emailService from './email.service';
import {
  CreatePaymentReceiptInput,
  UpdatePaymentReceiptInput,
  ApproveReceiptInput,
  PostReceiptInput,
  PaymentReceiptQueryInput,
} from '@validators/payment-receipt.validator';

const prisma = new PrismaClient();

class PaymentReceiptService {
  private async generateReceiptCode(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const count = await prisma.paymentReceipt.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    const sequence = (count + 1).toString().padStart(3, '0');
    return `PT-${dateStr}-${sequence}`;
  }

  async getAll(query: PaymentReceiptQueryInput) {
    const {
      page = '1',
      limit = '20',
      search,
      customerId,
      orderId,
      receiptType,
      paymentMethod,
      isPosted,
      approvalStatus,
      postedStatus,
      fromDate,
      toDate,
    } = query;

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

    const where: Prisma.PaymentReceiptWhereInput = {
      deletedAt: null,
      ...(customerId && { customerId }),
      ...(orderId && { orderId }),
      ...(receiptType && { receiptType }),
      ...(paymentMethod && { paymentMethod }),
      ...(isPosted !== undefined && { isPosted }),
      ...approvalStatusWhere,
      ...postedStatusWhere,
      ...(search && {
        OR: [
          { receiptCode: { contains: search } },
          { customerRef: { customerName: { contains: search } } },
          { transactionReference: { contains: search } },
        ],
      }),
      ...(fromDate &&
        toDate && {
          receiptDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    };

    const [receipts, total] = await Promise.all([
      prisma.paymentReceipt.findMany({
        where,
        include: {
          customerRef: {
            select: {
              id: true,
              customerCode: true,
              customerName: true,
              phone: true,
            },
          },
          customer: {
            select: {
              id: true,
              orderCode: true,
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
      prisma.paymentReceipt.count({ where }),
    ]);

    const sortedData = receipts.sort((a, b) => {
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

    // Stat Cards - Lấy tất cả receipts (không pagination)
    const allReceipts = await prisma.paymentReceipt.findMany({
      where,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        approvedBy: true,
        isPosted: true,
      },
    });

    const totalAmount = allReceipts.reduce((sum, r) => sum + Number(r.amount), 0);
    const cashAmount = allReceipts
      .filter((r) => r.paymentMethod === 'cash')
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const transferAmount = allReceipts
      .filter((r) => r.paymentMethod === 'transfer')
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const cardAmount = allReceipts
      .filter((r) => r.paymentMethod === 'card')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const approvedReceipts = allReceipts.filter((r) => r.approvedBy).length;
    const pendingReceipts = allReceipts.filter((r) => !r.approvedBy).length;
    const postedReceipts = allReceipts.filter((r) => r.isPosted).length;
    const unpostedAmount = allReceipts
      .filter((r) => !r.isPosted)
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const pendingAmount = allReceipts
      .filter((r) => !r.approvedBy)
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const statistics = {
      totalReceipts: allReceipts.length,
      totalAmount,
      cashAmount,
      transferAmount,
      cardAmount,
      approvedReceipts,
      pendingReceipts,
      postedReceipts,
      unpostedAmount,
      pendingAmount,
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

  async getById(id: number) {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id },
      include: {
        customerRef: {
          select: {
            id: true,
            customerCode: true,
            customerName: true,
            phone: true,
            email: true,
            address: true,
            currentDebt: true,
            creditLimit: true,
          },
        },
        customer: {
          select: {
            id: true,
            orderCode: true,
            orderDate: true,
            totalAmount: true,
            paidAmount: true,
            orderStatus: true,
            paymentStatus: true,
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

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    return receipt;
  }

  async create(data: CreatePaymentReceiptInput, userId: number) {
    const customer = await customerService.getById(data.customerId);

    if (customer.status !== 'active') {
      throw new ValidationError('Khách hàng phải ở trạng thái hoạt động để tạo phiếu thu');
    }

    if (data.orderId) {
      const order = await prisma.invoice.findUnique({
        where: { id: data.orderId },
      });

      if (!order) {
        throw new NotFoundError('Không tìm thấy đơn hàng');
      }

      if (order.customerId !== data.customerId) {
        throw new ValidationError('Đơn hàng không thuộc về khách hàng này');
      }

      const remainingAmount = Number(order.totalAmount) - Number(order.paidAmount);
      if (data.amount > remainingAmount) {
        throw new ValidationError(
          `Số tiền thanh toán (${data.amount}) vượt quá số tiền còn lại của đơn hàng (${remainingAmount})`
        );
      }
    }

    if (data.paymentMethod === 'transfer' || data.paymentMethod === 'card') {
      if (!data.bankName) {
        throw new ValidationError(
          'Tên ngân hàng là bắt buộc đối với thanh toán chuyển khoản và thẻ'
        );
      }
    }

    const receiptCode = await this.generateReceiptCode();

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.paymentReceipt.create({
        data: {
          receiptCode,
          receiptType: data.receiptType,
          customerId: data.customerId,
          orderId: data.orderId,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          bankName: data.bankName,
          transactionReference: data.transactionReference,
          receiptDate: new Date(data.receiptDate),
          notes: data.notes,
          isPosted: false,
          createdBy: userId,
        },
        include: {
          customerRef: true,
          customer: {
            select: {
              id: true,
              orderCode: true,
              totalAmount: true,
              paidAmount: true,
              orderStatus: true,
              paymentStatus: true,
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
      });

      return receipt;
    });

    logActivity('create', userId, 'payment_receipts', {
      recordId: result.id,
      receiptCode: result.receiptCode,
      amount: data.amount,
      customerId: data.customerId,
      orderId: data.orderId,
    });

    return result;
  }

  async update(id: number, data: UpdatePaymentReceiptInput, userId: number) {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id },
      include: {
        customer: true,
      },
    });

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    if (receipt.isPosted) {
      throw new ValidationError('Không thể cập nhật phiếu thu đã ghi sổ');
    }

    if (receipt.approvedBy) {
      throw new ValidationError('Không thể cập nhật phiếu thu đã được duyệt');
    }

    if (data.paymentMethod === 'transfer' || data.paymentMethod === 'card') {
      if (!data.bankName && !receipt.bankName) {
        throw new ValidationError(
          'Tên ngân hàng là bắt buộc đối với thanh toán chuyển khoản và thẻ'
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedReceipt = await tx.paymentReceipt.update({
        where: { id },
        data: {
          ...(data.receiptType && { receiptType: data.receiptType }),
          ...(data.amount !== undefined && { amount: data.amount }),
          ...(data.paymentMethod && { paymentMethod: data.paymentMethod }),
          ...(data.bankName !== undefined && { bankName: data.bankName }),
          ...(data.transactionReference !== undefined && {
            transactionReference: data.transactionReference,
          }),
          ...(data.receiptDate && { receiptDate: new Date(data.receiptDate) }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: {
          customerRef: true,
          customer: true,
        },
      });

      return updatedReceipt;
    });

    logActivity('update', userId, 'payment_receipts', {
      recordId: id,
      receiptCode: receipt.receiptCode,
      changes: data,
    });

    return result;
  }

  async approve(id: number, userId: number, data?: ApproveReceiptInput) {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id },
    });

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    if (receipt.isPosted) {
      throw new ValidationError('Không thể duyệt phiếu thu đã ghi sổ');
    }

    if (receipt.approvedBy) {
      throw new ValidationError('Phiếu thu đã được duyệt');
    }

    const updatedReceipt = await prisma.paymentReceipt.update({
      where: { id },
      data: {
        approvedBy: userId,
        approvedAt: new Date(),
        notes: data?.notes ? `${receipt.notes || ''}\n${data.notes}` : receipt.notes,
      },
      include: {
        customerRef: true,
        customer: true,
        creator: true,
        approver: true,
      },
    });

    logActivity('update', userId, 'payment_receipts', {
      recordId: id,
      action: 'approve_receipt',
      receiptCode: receipt.receiptCode,
    });

    return updatedReceipt;
  }

  async post(id: number, userId: number, data?: PostReceiptInput) {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id },
      include: {
        customerRef: true,
      },
    });

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    if (receipt.isPosted) {
      throw new ValidationError('Phiếu thu đã được ghi sổ');
    }

    if (!receipt.approvedBy) {
      throw new ValidationError('Phiếu thu phải được duyệt trước khi ghi sổ');
    }

    const updatedReceipt = await prisma.$transaction(async (tx) => {
      const posted = await tx.paymentReceipt.update({
        where: { id },
        data: {
          isPosted: true,
          notes: data?.notes ? `${receipt.notes || ''}\n[POSTED] ${data.notes}` : receipt.notes,
        },
        include: {
          customerRef: true,
          customer: true,
          creator: true,
          approver: true,
        },
      });

      // Áp dụng tác động tài chính: cập nhật paidAmount, paymentStatus, currentDebt, CashFund
      await this.applyFinancialImpact(receipt, userId);

      return posted;
    });

    logActivity('update', userId, 'payment_receipts', {
      recordId: id,
      action: 'post_receipt',
      receiptCode: receipt.receiptCode,
    });

    return updatedReceipt;
  }

  async delete(id: number, userId: number) {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id },
      include: {
        customer: true,
      },
    });

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    if (receipt.isPosted) {
      throw new ValidationError('Không thể xóa phiếu thu đã ghi sổ');
    }

    if (receipt.approvedBy) {
      throw new ValidationError('Không thể xóa phiếu thu đã được duyệt');
    }

    // await prisma.$transaction(async (tx) => {
    //   await this.revertFinancialImpact(receipt, userId);

    //   await tx.paymentReceipt.delete({
    //     where: { id },
    //   });
    // });

    // soft delete
    await prisma.paymentReceipt.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    logActivity('delete', userId, 'payment_receipts', {
      recordId: id,
      receiptCode: receipt.receiptCode,
    });

    return { message: 'Xóa phiếu thu thành công' };
  }

  private async applyFinancialImpact(receipt: any, _userId: number) {
    // Cập nhật Sổ quỹ (CashFund) - Tiền tăng lên
    const receiptDate = new Date(receipt.receiptDate);
    const fundDate = new Date(
      receiptDate.getFullYear(),
      receiptDate.getMonth(),
      receiptDate.getDate()
    );

    // Tìm hoặc tạo bản ghi CashFund của ngày đó
    let cashFund = await prisma.cashFund.findUnique({
      where: { fundDate },
    });

    if (!cashFund) {
      // Nếu chưa có, tạo mới với số dư bằng 0
      cashFund = await prisma.cashFund.create({
        data: {
          fundDate,
          openingBalance: 0,
          totalReceipts: 0,
          totalPayments: 0,
          isLocked: false,
        },
      });
    }

    // Kiểm tra xem sổ quỹ ngày đó có bị khóa không
    if (cashFund.isLocked) {
      throw new ValidationError(
        `Sổ quỹ ngày ${fundDate.toLocaleDateString('vi-VN')} đã bị khóa, không thể ghi sổ phiếu này`
      );
    }

    // Cập nhật CashFund: Cộng tiền thu vào totalReceipts và closingBalance
    const newTotalReceipts = Number(cashFund.totalReceipts) + Number(receipt.amount);
    const newClosingBalance =
      Number(cashFund.openingBalance) + newTotalReceipts - Number(cashFund.totalPayments);

    await prisma.cashFund.update({
      where: { fundDate },
      data: {
        totalReceipts: newTotalReceipts,
        closingBalance: newClosingBalance,
      },
    });

    // Cập nhật Đơn hàng và Công nợ khách hàng
    if (receipt.orderId) {
      const order = await prisma.invoice.findUnique({
        where: { id: receipt.orderId },
      });

      if (order) {
        const newPaidAmount = Number(order.paidAmount) + Number(receipt.amount);
        let paymentStatus: 'unpaid' | 'partial' | 'paid';

        if (newPaidAmount >= Number(order.totalAmount)) {
          paymentStatus = 'paid';
        } else if (newPaidAmount > 0) {
          paymentStatus = 'partial';
        } else {
          paymentStatus = 'unpaid';
        }

        await prisma.invoice.update({
          where: { id: receipt.orderId },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus,
          },
        });

        // Cập nhật công nợ khách hàng nếu đơn hàng đã hoàn thành
        if (order.orderStatus === 'completed') {
          await prisma.customer.update({
            where: { id: receipt.customerId },
            data: {
              currentDebt: {
                decrement: Number(receipt.amount),
              },
              debtUpdatedAt: new Date(),
            },
          });
        }
      }
    } else if (receipt.receiptType === 'debt_collection') {
      // Phiếu thu công nợ: trừ trực tiếp vào công nợ khách hàng
      await prisma.customer.update({
        where: { id: receipt.customerId },
        data: {
          currentDebt: {
            decrement: Number(receipt.amount),
          },
          debtUpdatedAt: new Date(),
        },
      });
    }
  }

  // private async revertFinancialImpact(receipt: any, _userId: number) {
  //   // Đảo ngược Sổ quỹ (CashFund) - Tiền giảm xuống
  //   const receiptDate = new Date(receipt.receiptDate);
  //   const fundDate = new Date(receiptDate.getFullYear(), receiptDate.getMonth(), receiptDate.getDate());

  //   const cashFund = await prisma.cashFund.findUnique({
  //     where: { fundDate },
  //   });

  //   if (cashFund) {
  //     const newTotalReceipts = Math.max(0, Number(cashFund.totalReceipts) - Number(receipt.amount));
  //     const newClosingBalance = Number(cashFund.openingBalance) + newTotalReceipts - Number(cashFund.totalPayments);

  //     await prisma.cashFund.update({
  //       where: { fundDate },
  //       data: {
  //         totalReceipts: newTotalReceipts,
  //         closingBalance: newClosingBalance,
  //       },
  //     });
  //   }

  //   // Đảo ngược Đơn hàng và Công nợ khách hàng
  //   if (receipt.orderId) {
  //     const order = await prisma.invoice.findUnique({
  //       where: { id: receipt.orderId },
  //     });

  //     if (order) {
  //       const newPaidAmount = Number(order.paidAmount) - Number(receipt.amount);
  //       let paymentStatus: 'unpaid' | 'partial' | 'paid';

  //       if (newPaidAmount >= Number(order.totalAmount)) {
  //         paymentStatus = 'paid';
  //       } else if (newPaidAmount > 0) {
  //         paymentStatus = 'partial';
  //       } else {
  //         paymentStatus = 'unpaid';
  //       }

  //       await prisma.invoice.update({
  //         where: { id: receipt.orderId },
  //         data: {
  //           paidAmount: newPaidAmount,
  //           paymentStatus,
  //         },
  //       });

  //       if (order.orderStatus === 'completed') {
  //         await prisma.customer.update({
  //           where: { id: receipt.customerId },
  //           data: {
  //             currentDebt: {
  //               increment: Number(receipt.amount),
  //             },
  //             debtUpdatedAt: new Date(),
  //           },
  //         });
  //       }
  //     }
  //   } else if (receipt.receiptType === 'debt_collection') {
  //     await prisma.customer.update({
  //       where: { id: receipt.customerId },
  //       data: {
  //         currentDebt: {
  //           increment: Number(receipt.amount),
  //         },
  //         debtUpdatedAt: new Date(),
  //       },
  //     });
  //   }
  // }

  async getByCustomer(customerId: number) {
    const receipts = await prisma.paymentReceipt.findMany({
      where: { customerId },
      include: {
        customer: {
          select: {
            id: true,
            orderCode: true,
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
      orderBy: {
        receiptDate: 'desc',
      },
    });

    return receipts;
  }

  async getSummary(fromDate?: string, toDate?: string) {
    const where: Prisma.PaymentReceiptWhereInput = {
      isPosted: true,
      ...(fromDate &&
        toDate && {
          receiptDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    };

    const receipts = await prisma.paymentReceipt.findMany({
      where,
      select: {
        receiptType: true,
        paymentMethod: true,
        amount: true,
      },
    });

    const totalAmount = receipts.reduce((sum, r) => sum + Number(r.amount), 0);

    const byType = receipts.reduce((acc, r) => {
      acc[r.receiptType] = (acc[r.receiptType] || 0) + Number(r.amount);
      return acc;
    }, {} as Record<string, number>);

    const byMethod = receipts.reduce((acc, r) => {
      acc[r.paymentMethod] = (acc[r.paymentMethod] || 0) + Number(r.amount);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalReceipts: receipts.length,
      totalAmount,
      byType,
      byMethod,
    };
  }

  async sendEmail(id: number, userId: number) {
    const receipt = await this.getById(id);

    if (!receipt.customerRef?.email) {
      throw new ValidationError('Khách hàng không có địa chỉ email');
    }

    try {
      await emailService.sendPaymentReceiptEmail(receipt);
    } catch (error) {
      throw new Error('Lỗi không gửi được email');
    }

    // Log activity
    logActivity('send_email', userId, 'payment_receipts', {
      recordId: id,
      receiptCode: receipt.receiptCode,
      to: receipt.customerRef.email,
    });

    return receipt;
  }
}

export default new PaymentReceiptService();
