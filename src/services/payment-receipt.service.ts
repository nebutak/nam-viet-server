import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import customerService from './customer.service';
import emailService from './email.service';
import invoiceService from './invoice.service';
import smartDebtService from './smart-debt.service';
import {
  CreatePaymentReceiptInput,
  UpdatePaymentReceiptInput,
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
      supplierId,
      orderId,
      purchaseOrderId,
      receiptType,
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

    const where: Prisma.PaymentReceiptWhereInput = {
      deletedAt: null,
      ...(customerId && { customerId }),
      ...(supplierId && { supplierId }),
      ...(orderId && { orderId }),
      ...(purchaseOrderId && { purchaseOrderId }),
      ...(receiptType && { receiptType }),
      ...(paymentMethod && { paymentMethod }),
      ...(isPosted !== undefined && { isPosted }),
      ...(createdBy && { createdBy }),
      ...approvalStatusWhere,
      ...postedStatusWhere,
      ...(search && {
        OR: [
          { receiptCode: { contains: search } },
          { customerRef: { customerName: { contains: search } } },
          { supplier: { supplierName: { contains: search } } },
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
              cccd: true,
            },
          },
          invoice: {
            select: {
              id: true,
              orderCode: true,
            },
          },
          supplier: {
            select: {
              id: true,
              supplierCode: true,
              supplierName: true,
            },
          },
          purchaseOrder: {
            select: {
              id: true,
              poCode: true,
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
          { isPosted: 'asc' }, // false (chưa ghi sổ) trước true
          { createdAt: 'desc' }, // mới nhất trên
        ],
      }),
      prisma.paymentReceipt.count({ where }),
    ]);

    const sortedData = receipts.sort((a, b) => {
      // Sắp xếp theo isPosted (false trước true)
      if (a.isPosted === false && b.isPosted === true) return -1;
      if (a.isPosted === true && b.isPosted === false) return 1;

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

    const postedReceipts = allReceipts.filter((r) => r.isPosted).length;
    const unpostedAmount = allReceipts
      .filter((r) => !r.isPosted)
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const statistics = {
      totalReceipts: allReceipts.length,
      totalAmount,
      cashAmount,
      transferAmount,
      cardAmount,
      postedReceipts,
      unpostedAmount,
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

  async getMyReceipts(userId: number, query: PaymentReceiptQueryInput) {
    return this.getAll({ ...query, createdBy: userId } as any);
  }

  async getById(id: number) {
    const receipt = await prisma.paymentReceipt.findFirst({
      where: { id, deletedAt: null },
      include: {
        customerRef: {
          select: {
            id: true,
            customerCode: true,
            customerName: true,
            phone: true,
            cccd: true,
            email: true,
            address: true,
            currentDebt: true,
            creditLimit: true,
          },
        },
        invoice: {
          select: {
            id: true,
            orderCode: true,
            orderDate: true,
            totalAmount: true,
            paidAmount: true,
            orderStatus: true,
            paymentStatus: true,
            details: {
              include: {
                product: {
                  include: { unit: true }
                }
              }
            }
          },
        },
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
        purchaseOrder: {
          include: {
            details: {
              include: {
                product: {
                  include: {
                    unit: true
                  }
                }
              }
            }
          }
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
      },
    });

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    const result: any = { ...receipt };
    if (receipt.customerRef) {
      result.receiver = {
        id: receipt.customerRef.id,
        name: receipt.customerRef.customerName,
        code: receipt.customerRef.customerCode,
        phone: receipt.customerRef.phone,
        email: receipt.customerRef.email,
        address: receipt.customerRef.address,
        identityCard: receipt.customerRef.cccd,
      };
    } else if (receipt.supplier) {
      result.receiver = {
        id: receipt.supplier.id,
        name: receipt.supplier.supplierName,
        code: receipt.supplier.supplierCode,
        phone: receipt.supplier.phone,
        email: receipt.supplier.email,
        address: receipt.supplier.address,
        identityCard: receipt.supplier.taxCode,
      };
    }
    if (receipt.invoice) {
      result.invoice = {
        ...receipt.invoice,
        code: receipt.invoice.orderCode,
        items: (receipt.invoice as any).details?.map((d: any) => ({
          ...d,
          productName: d.product?.productName,
          productCode: d.product?.code,
          unitName: d.product?.unit?.name || 'Không có',
          image: d.product?.image,
        })) || []
      };
    }
    if (receipt.creator) {
      result.createdByUser = receipt.creator;
    }

    return result;
  }

  async create(data: CreatePaymentReceiptInput, userId: number) {
    if (data.customerId) {
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
    } else if (data.supplierId) {
        const supplier = await prisma.supplier.findUnique({
            where: { id: data.supplierId },
        });

        if (!supplier) {
            throw new NotFoundError('Không tìm thấy nhà cung cấp');
        }

        if (supplier.status !== 'active') {
            throw new ValidationError('Nhà cung cấp phải ở trạng thái hoạt động để tạo phiếu thu (hoàn tiền)');
        }

        if (data.purchaseOrderId) {
            const po = await prisma.purchaseOrder.findUnique({
                where: { id: data.purchaseOrderId },
            });

            if (!po) {
                throw new NotFoundError('Không tìm thấy đơn mua hàng');
            }

            if (po.supplierId !== data.supplierId) {
                throw new ValidationError('Đơn mua hàng không thuộc về nhà cung cấp này');
            }
        }
    } else if (data.notes?.trim() === 'Thu đầu kỳ' || data.receiptType === 'other') {
        // Thu đầu kỳ / Loại khác: không cần khách hàng hay nhà cung cấp
    } else {
        throw new ValidationError('Phải chọn khách hàng hoặc nhà cung cấp');
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
          supplierId: data.supplierId,
          orderId: data.orderId,
          purchaseOrderId: data.purchaseOrderId,
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
          customerRef: {
            select: {
              id: true,
              customerCode: true,
              customerName: true,
              phone: true,
              cccd: true,
            },
          },
          invoice: {
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
      supplierId: data.supplierId,
      orderId: data.orderId,
      purchaseOrderId: data.purchaseOrderId,
    });

    return result;
  }

  async update(id: number, data: UpdatePaymentReceiptInput, userId: number) {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id },
      include: {
        invoice: true,
      },
    });

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    if (receipt.isPosted) {
      throw new ValidationError('Không thể cập nhật phiếu thu đã ghi sổ');
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
          customerRef: {
            select: {
              id: true,
              customerCode: true,
              customerName: true,
              phone: true,
              cccd: true,
            },
          },
          invoice: true,
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


    const updatedReceipt = await prisma.$transaction(async (tx) => {
      const posted = await tx.paymentReceipt.update({
        where: { id },
        data: {
          isPosted: true,
          notes: data?.notes ? `${receipt.notes || ''}\n[POSTED] ${data.notes}` : receipt.notes,
        },
        include: {
          customerRef: true,
          invoice: true,
          creator: true,
        },
      });

      // Áp dụng tác động tài chính: cập nhật paidAmount, paymentStatus, currentDebt
      await this.applyFinancialImpact(posted, userId, tx);

      // Gọi logic kiểm tra hoàn thành tập trung
      if (posted.orderId) {
        await (invoiceService as any).checkAndCompleteOrder(posted.orderId, userId, tx);
      } else if (posted.customerId) {
        // Phiếu thu không liên kết đơn hàng cụ thể (thu công nợ tổng):
        // Quét tất cả đơn hàng chưa hoàn thành của khách để cập nhật trạng thái
        const pendingOrders = await tx.invoice.findMany({
          where: {
            customerId: posted.customerId,
            paymentStatus: { in: ['unpaid', 'partial'] },
            orderStatus: { notIn: ['cancelled', 'completed'] },
            deletedAt: null,
          },
          select: { id: true },
          orderBy: { orderDate: 'asc' }, // Xử lý đơn cũ trước
        });
        for (const order of pendingOrders) {
          await (invoiceService as any).checkAndCompleteOrder(order.id, userId, tx);
        }
      }

      return posted;
    });

    logActivity('update', userId, 'payment_receipts', {
      recordId: id,
      action: 'post_receipt',
      receiptCode: receipt.receiptCode,
    });

    // Auto-sync công nợ khách hàng/nhà cung cấp sau khi ghi sổ phiếu thu
    const year = new Date().getFullYear();
    if (receipt.customerId) {
      smartDebtService.syncSnap({ customerId: receipt.customerId, year }).catch((err) =>
        console.error(`[AutoSync] Failed to sync debt after post receipt for customer ${receipt.customerId}:`, err.message)
      );
    } else if (receipt.supplierId) {
      smartDebtService.syncSnap({ supplierId: receipt.supplierId, year }).catch((err) =>
        console.error(`[AutoSync] Failed to sync debt after post receipt for supplier ${receipt.supplierId}:`, err.message)
      );
    }

    return updatedReceipt;
  }

  async unpost(id: number, userId: number) {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id },
      include: {
        customerRef: true,
      },
    });

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    if (!receipt.isPosted) {
      throw new ValidationError('Phiếu thu chưa được ghi sổ');
    }

    const updatedReceipt = await prisma.$transaction(async (tx) => {
      const unposted = await tx.paymentReceipt.update({
        where: { id },
        data: {
          isPosted: false,
          notes: `${receipt.notes || ''}\n[UNPOSTED] bởi user ${userId} lúc ${new Date().toISOString()}`,
        },
        include: {
          customerRef: true,
          invoice: true,
          creator: true,
        },
      });

      // Đảo ngược tác động tài chính
      await this.revertFinancialImpact(receipt, userId, tx);

      return unposted;
    });

    logActivity('update', userId, 'payment_receipts', {
      recordId: id,
      action: 'unpost_receipt',
      receiptCode: receipt.receiptCode,
    });

    // Auto-sync công nợ khách hàng/nhà cung cấp sau khi bỏ ghi sổ phiếu thu
    const year = new Date().getFullYear();
    if (receipt.customerId) {
      smartDebtService.syncSnap({ customerId: receipt.customerId, year }).catch((err) =>
        console.error(`[AutoSync] Failed to sync debt after unpost receipt for customer ${receipt.customerId}:`, err.message)
      );
    } else if (receipt.supplierId) {
      smartDebtService.syncSnap({ supplierId: receipt.supplierId, year }).catch((err) =>
        console.error(`[AutoSync] Failed to sync debt after unpost receipt for supplier ${receipt.supplierId}:`, err.message)
      );
    }

    return updatedReceipt;
  }

  async delete(id: number, userId: number) {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id },
      include: {
        invoice: true,
      },
    });

    if (!receipt) {
      throw new NotFoundError('Không tìm thấy phiếu thu');
    }

    if (receipt.isPosted) {
      throw new ValidationError('Không thể xóa phiếu thu đã ghi sổ');
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

  private async applyFinancialImpact(receipt: any, _userId: number, tx: any = prisma) {
    // Cập nhật Đơn hàng và Công nợ khách hàng
    if (receipt.orderId) {
      const order = await tx.invoice.findUnique({
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

        await tx.invoice.update({
          where: { id: receipt.orderId },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus,
          },
        });

        // Cập nhật công nợ khách hàng nếu đơn hàng đã hoàn thành
        if (order.orderStatus === 'completed') {
          await tx.customer.update({
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
    } else if (receipt.supplierId) {
        // Hoàn tiền cho nhà cung cấp: Giảm số tiền đã thanh toán (vì po.paidAmount ghi nhận tiền đã chi, 
        // hoàn tiền thì thực chất là giảm tiền đã chi thực tế hoặc coi như một khoản thu lại)
        // Thông thường: supplier.totalPayable -= receipt.amount (giảm nợ của mình với supplier)
        await tx.supplier.update({
            where: { id: receipt.supplierId },
            data: {
              totalPayable: {
                decrement: Number(receipt.amount),
              },
              payableUpdatedAt: new Date(),
            },
        });

        if (receipt.purchaseOrderId) {
            const po = await tx.purchaseOrder.findUnique({ where: { id: receipt.purchaseOrderId } });
            if (po) {
                const newPaidAmount = Math.max(0, Number(po.paidAmount) - Number(receipt.amount));
                const totalAmount = Number(po.totalAmount);
                let paymentStatus: string = 'unpaid';
                if (newPaidAmount >= totalAmount && totalAmount > 0) {
                    paymentStatus = 'paid';
                } else if (newPaidAmount > 0) {
                    paymentStatus = 'partial';
                }

                await tx.purchaseOrder.update({
                    where: { id: receipt.purchaseOrderId },
                    data: {
                        paidAmount: newPaidAmount,
                        paymentStatus: paymentStatus as any,
                    }
                });
            }
        }
    } else if (receipt.receiptType === 'debt_collection') {
      // Phiếu thu công nợ: trừ trực tiếp vào công nợ khách hàng
      await tx.customer.update({
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

  private async revertFinancialImpact(receipt: any, _userId: number, tx: any = prisma) {
    // Đảo ngược Đơn hàng và Công nợ khách hàng
    if (receipt.orderId) {
      const order = await tx.invoice.findUnique({
        where: { id: receipt.orderId },
      });

      if (order) {
        const newPaidAmount = Math.max(0, Number(order.paidAmount) - Number(receipt.amount));
        let paymentStatus: 'unpaid' | 'partial' | 'paid';

        if (newPaidAmount >= Number(order.totalAmount)) {
          paymentStatus = 'paid';
        } else if (newPaidAmount > 0) {
          paymentStatus = 'partial';
        } else {
          paymentStatus = 'unpaid';
        }

        await tx.invoice.update({
          where: { id: receipt.orderId },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus,
          },
        });

        if (order.orderStatus === 'completed') {
          await tx.customer.update({
            where: { id: receipt.customerId },
            data: {
              currentDebt: {
                increment: Number(receipt.amount),
              },
              debtUpdatedAt: new Date(),
            },
          });
        }
      }
    } else if (receipt.supplierId) {
        await tx.supplier.update({
            where: { id: receipt.supplierId },
            data: {
              totalPayable: {
                increment: Number(receipt.amount),
              },
              payableUpdatedAt: new Date(),
            },
        });

        if (receipt.purchaseOrderId) {
            await tx.purchaseOrder.update({
                where: { id: receipt.purchaseOrderId },
                data: {
                    paidAmount: {
                        increment: Number(receipt.amount),
                    }
                }
            });
        }
    } else if (receipt.receiptType === 'debt_collection') {
      await tx.customer.update({
        where: { id: receipt.customerId },
        data: {
          currentDebt: {
            increment: Number(receipt.amount),
          },
          debtUpdatedAt: new Date(),
        },
      });
    }
  }


  async getByCustomer(customerId: number) {
    const receipts = await prisma.paymentReceipt.findMany({
      where: { customerId, deletedAt: null },
      include: {
        invoice: {
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

  async getQRCode(id: number) {
    const receipt = await this.getById(id);

    if (receipt.paymentMethod !== 'transfer') {
      throw new ValidationError('Chỉ hỗ trợ tạo QR code cho phương thức thanh toán chuyển khoản');
    }

    if (!receipt.bankName) {
      throw new ValidationError('Không tìm thấy thông tin tài khoản ngân hàng');
    }

    try {
      const bankInfo = JSON.parse(receipt.bankName);
      const amount = Number(receipt.amount);
      const description = `${receipt.receiptCode}`;

      // VietQR URL format: https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<DESCRIPTION>&accountName=<ACCOUNT_NAME>
      const qrLink = `https://img.vietqr.io/image/${bankInfo.bankName}-${bankInfo.accountNumber}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(bankInfo.accountName)}`;

      return {
        qrLink,
        amount,
        voucherCode: receipt.receiptCode,
        description,
        bankName: bankInfo.bankName,
        accountNo: bankInfo.accountNumber,
        accountName: bankInfo.accountName,
      };
    } catch (error) {
      throw new ValidationError('Thông tin tài khoản ngân hàng không hợp lệ (yêu cầu định dạng JSON)');
    }
  }
}

export default new PaymentReceiptService();
