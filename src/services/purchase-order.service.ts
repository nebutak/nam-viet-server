import { PrismaClient, Prisma, PurchaseOrderDetail } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
  type CreatePurchaseOrderInput,
  type PurchaseOrderQueryInput,
  type ReceivePurchaseOrderInput,
  type UpdatePurchaseOrderInput,
  type ReturnPurchaseOrderInput,
} from '@validators/purchase-order.validator';
import sendPurchaseOrderEmail from './email.service';
import stockTransactionService from './stock-transaction.service';

const prisma = new PrismaClient();

class PurchaseOrderService {
  private async generatePOCode(): Promise<string> {
    const prefix = 'PO';
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const count = await prisma.purchaseOrder.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    const sequence = (count + 1).toString().padStart(4, '0');
    return `${prefix}-${dateStr}-${sequence}`;
  }

  async getAll(query: PurchaseOrderQueryInput) {
    const {
      page = '1',
      limit = '20',
      search = '',
      status,
      supplierId,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { poCode: { contains: search } },
          { supplier: { supplierName: { contains: search } } },
        ],
      }),
      ...(status && { status: status as any }),
      ...(supplierId && { supplierId: parseInt(supplierId) }),
      ...(fromDate &&
        toDate && {
          orderDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    };

    const total = await prisma.purchaseOrder.count({ where });

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      select: {
        id: true,
        poCode: true,
        orderDate: true,
        expectedDeliveryDate: true,
        totalAmount: true,
        status: true,
        notes: true,
        subTotal: true,
        taxAmount: true,
        discountAmount: true,
        otherCosts: true,
        paidAmount: true,
        paymentStatus: true,
        createdAt: true,
        supplier: {
          select: {
            id: true,
            supplierName: true,
            supplierCode: true,
            contactName: true,
            phone: true,
            taxCode: true,
          },
        },
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            phone: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
          },
        },
        _count: {
          select: {
            details: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: skip,
      take: limitNum,
    });

    // Stat Cards
    const cards = {
      pending: await prisma.purchaseOrder.count({ where: { ...where, status: 'pending' } }),
      approved: await prisma.purchaseOrder.count({ where: { ...where, status: 'approved' } }),
      received: await prisma.purchaseOrder.count({ where: { ...where, status: 'received' } }),
      cancelled: await prisma.purchaseOrder.count({ where: { ...where, status: 'cancelled' } }),
    };

    const result = {
      data: purchaseOrders,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        last_page: Math.ceil(total / limitNum),
      },
      cards,
      message: 'Success',
    };

    return result;
  }

  async getByUser(query: PurchaseOrderQueryInput, userId: number) {
    const {
      page = '1',
      limit = '20',
      search = '',
      status,
      supplierId,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      createdBy: userId,
      ...(search && {
        OR: [
          { poCode: { contains: search } },
          { supplier: { supplierName: { contains: search } } },
        ],
      }),
      ...(status && { status: status as any }),
      ...(supplierId && { supplierId: parseInt(supplierId) }),
      ...(fromDate &&
        toDate && {
          orderDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    };

    const total = await prisma.purchaseOrder.count({ where });

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      select: {
        id: true,
        poCode: true,
        orderDate: true,
        expectedDeliveryDate: true,
        totalAmount: true,
        status: true,
        notes: true,
        subTotal: true,
        taxAmount: true,
        discountAmount: true,
        otherCosts: true,
        paidAmount: true,
        paymentStatus: true,
        createdAt: true,
        supplier: {
          select: {
            id: true,
            supplierName: true,
            supplierCode: true,
            contactName: true,
            phone: true,
            taxCode: true,
          },
        },
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            phone: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
          },
        },
        _count: {
          select: {
            details: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: skip,
      take: limitNum,
    });

    // Stat Cards
    const cards = {
      pending: await prisma.purchaseOrder.count({ where: { ...where, status: 'pending' } }),
      approved: await prisma.purchaseOrder.count({ where: { ...where, status: 'approved' } }),
      received: await prisma.purchaseOrder.count({ where: { ...where, status: 'received' } }),
      cancelled: await prisma.purchaseOrder.count({ where: { ...where, status: 'cancelled' } }),
    };

    const result = {
      data: purchaseOrders,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        last_page: Math.ceil(total / limitNum),
      },
      cards,
      message: 'Success',
    };

    return result;
  }

  async getById(id: number) {
    const [po, warehouseReceipts] = await Promise.all([
      prisma.purchaseOrder.findUnique({
        where: { id },
        include: {
          supplier: true,
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              phone: true,
              email: true,
            },
          },
          approver: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
            },
          },
          paymentVouchers: {
            where: {
              deletedAt: null,
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
          },
          refundReceipts: {
            where: {
              deletedAt: null,
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
          },
          details: {
            include: {
              product: {
                select: {
                  id: true,
                  code: true,
                  productName: true,
                  unit: true,
                  image: true,
                  basePrice: true,
                },
              },
            },
          },
        },
      }),
      prisma.stockTransaction.findMany({
        where: {
          referenceId: id,
          referenceType: { in: ['purchase_order', 'purchase_refunds'] },
          deletedAt: null,
        },
        include: {
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true
            }
          },
          details: {
            include: {
              product: {
                select: {
                  id: true,
                  code: true,
                  productName: true,
                  unit: true,
                  image: true,
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
    ]);

    if (!po) {
      throw new NotFoundError('Purchase Order');
    }

    // Map stock transactions to the format expected by the frontend
    const mappedReceipts = warehouseReceipts.map(receipt => ({
      ...receipt,
      code: receipt.transactionCode,
      receiptDate: receipt.createdAt,
      receiptType: receipt.transactionType === 'import' ? 1 : 2,
      referenceType: receipt.referenceType,
      createdByUser: receipt.creator,
      status: receipt.isPosted ? 'posted' : 'draft'
    }));

    // Map payment receipts to format expected by the frontend payment vouchers table
    const poAny = po as any;
    const mappedReceiptsAsVouchers = (poAny.refundReceipts || []).map((receipt: any) => ({
      id: receipt.id,
      voucherCode: receipt.receiptCode,
      amount: receipt.amount,
      paymentMethod: receipt.paymentMethod,
      status: receipt.isPosted ? 'posted' : 'draft',
      voucherType: 'refund',
      paymentDate: receipt.receiptDate,
      createdAt: receipt.createdAt,
      creator: receipt.creator,
      isReceipt: true, // Specific flag for the frontend
    }));

    const sortedPaymentVouchersAndReceipts = [...(poAny.paymentVouchers || []), ...mappedReceiptsAsVouchers].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const purchaseOrder = {
      ...po,
      paymentVouchers: sortedPaymentVouchersAndReceipts,
      stockTransaction: warehouseReceipts.length > 0 ? warehouseReceipts[0] : null,
      warehouseReceipts: mappedReceipts,
    };

    return purchaseOrder;
  }

  async create(data: CreatePurchaseOrderInput, userId: number) {
    let supplierId = data.supplierId;
    let validatedSupplier: any = null;

    // Handle Supplier logic
    if (supplierId) {
      validatedSupplier = await prisma.supplier.findUnique({
        where: { id: Number(supplierId) },
      });
      if (!validatedSupplier) {
        throw new NotFoundError('Supplier');
      }
      if (validatedSupplier.status !== 'active') {
        throw new ValidationError('Nhà cung cấp phải ở trạng thái hoạt động để tạo đơn hàng');
      }

      // If newSupplier data is provided while supplierId exists, update the supplier
      if (data.newSupplier) {
        await prisma.supplier.update({
          where: { id: Number(supplierId) },
          data: {
            supplierName: data.newSupplier.name || validatedSupplier.supplierName,
            phone: data.newSupplier.phone || validatedSupplier.phone,
            email: data.newSupplier.email || validatedSupplier.email,
            address: data.newSupplier.address || validatedSupplier.address,
            taxCode: data.newSupplier.taxCode || validatedSupplier.taxCode,
          }
        });
      }
    } else if (data.newSupplier) {
      // Create new supplier
      const newSup = await prisma.supplier.create({
        data: {
          supplierName: data.newSupplier.name || 'Nhà cung cấp mới',
          supplierCode: `NCC-${Date.now()}`,
          supplierType: 'local',
          phone: data.newSupplier.phone || '',
          email: data.newSupplier.email || null,
          address: data.newSupplier.address || null,
          taxCode: data.newSupplier.taxCode || null,
          status: 'active',
          createdBy: userId,
        }
      });
      supplierId = newSup.id;
      validatedSupplier = newSup;
    } else {
      throw new ValidationError('Thông tin nhà cung cấp không hợp lệ. Vui lòng chọn nhà cung cấp hoặc cung cấp thông tin mới.');
    }

    // Validate products
    for (const detail of data.details) {
      const product = await prisma.product.findUnique({
        where: { id: detail.productId },
      });
      if (!product) {
        throw new NotFoundError(`Product with ID ${detail.productId}`);
      }
    }

    // Generate PO code
    const poCode = await this.generatePOCode();

    // Calculate totals if not provided
    const subTotal = data.subTotal ?? data.details.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const taxAmount = data.taxAmount ?? 0;
    const discountAmount = data.discountAmount ?? data.discount ?? 0;
    const otherCosts = data.otherCosts ?? 0;
    const totalAmount = data.totalAmount ?? (subTotal + taxAmount + otherCosts - discountAmount);
    
    const status = data.isAutoApprove ? 'approved' : 'pending';
    const approvedBy = data.isAutoApprove ? userId : null;

    // Create purchase order
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poCode,
        supplierId: supplierId as number,
        orderDate: new Date(data.orderDate as string),
        expectedDeliveryDate: data.expectedDeliveryDate
          ? new Date(data.expectedDeliveryDate as string)
          : null,
        subTotal,
        taxAmount,
        discountAmount,
        otherCosts,
        totalAmount,
        status,
        approvedBy,
        notes: data.notes,
        createdBy: userId,
        details: {
          create: data.details.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            baseQuantity: item.baseQuantity ?? item.quantity,
            conversionFactor: item.conversionFactor ?? 1,
            price: item.price,
            discountRate: item.discountRate ?? 0,
            discountAmount: item.discountAmount ?? 0,
            taxRate: item.taxRate,
            taxIds: item.taxIds ? (item.taxIds as any) : undefined,
            taxAmount: item.taxAmount ?? 0,
            total: item.total ?? (item.price * item.quantity + (item.taxAmount ?? 0) - (item.discountAmount ?? 0)),
            periodMonths: item.periodMonths,
            warrantyCost: item.warrantyCost ?? 0,
            applyWarranty: item.applyWarranty ?? false,
            unitId: item.unitId,
            unitName: item.unitName,
            notes: item.notes,
          })),
        },
      },
      include: {
        supplier: true,
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            phone: true,
            email: true,
          },
        },
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    // Log activity
    logActivity('create', userId, 'purchase_orders', {
      recordId: purchaseOrder.id,
      poCode: purchaseOrder.poCode,
    });

    return purchaseOrder;
  }

  async update(id: number, data: UpdatePurchaseOrderInput, userId: number) {
    const purchaseOrder = await this.getById(id);

    // Only allow update for pending status
    if (purchaseOrder.status !== 'pending') {
      throw new ValidationError('Chỉ đơn mua ở trạng thái chờ duyệt mới có thể update');
    }

    let supplierId = data.supplierId || purchaseOrder.supplierId;
    if (data.supplierId || data.newSupplier) {
      if (data.supplierId) {
        const validatedSupplier = await prisma.supplier.findUnique({
          where: { id: Number(data.supplierId) },
        });
        if (!validatedSupplier) {
          throw new NotFoundError('Supplier');
        }

        if (data.newSupplier) {
          await prisma.supplier.update({
            where: { id: Number(data.supplierId) },
            data: {
              supplierName: data.newSupplier.name || validatedSupplier.supplierName,
              phone: data.newSupplier.phone || validatedSupplier.phone,
              email: data.newSupplier.email || validatedSupplier.email,
              address: data.newSupplier.address || validatedSupplier.address,
              taxCode: data.newSupplier.taxCode || validatedSupplier.taxCode,
            }
          });
        }
        supplierId = Number(data.supplierId);
      } else if (data.newSupplier) {
        const newSup = await prisma.supplier.create({
          data: {
            supplierName: data.newSupplier.name || 'Nhà cung cấp mới',
            supplierCode: `NCC-${Date.now()}`,
            supplierType: 'local',
            phone: data.newSupplier.phone || '',
            email: data.newSupplier.email || null,
            address: data.newSupplier.address || null,
            taxCode: data.newSupplier.taxCode || null,
            status: 'active',
            createdBy: userId,
          }
        });
        supplierId = newSup.id;
      }
    }

    // Calculate subTotal if details provided
    let subTotal = data.subTotal ?? purchaseOrder.subTotal;
    if (data.details && !data.subTotal) {
      // Validate products
      for (const detail of data.details) {
        const product = await prisma.product.findUnique({
          where: { id: detail.productId },
        });
        if (!product) {
          throw new NotFoundError(`Product with ID ${detail.productId}`);
        }
      }

      subTotal = data.details.reduce((sum, item) => new Prisma.Decimal(Number(sum) + Number(item.price) * item.quantity), new Prisma.Decimal(0));
    }

    const taxAmount = data.taxAmount ?? purchaseOrder.taxAmount;
    const discountAmount = data.discountAmount ?? data.discount ?? purchaseOrder.discountAmount;
    const otherCosts = data.otherCosts ?? purchaseOrder.otherCosts;

    const totalAmount = data.totalAmount ?? new Prisma.Decimal(Number(subTotal) + Number(taxAmount) + Number(otherCosts) - Number(discountAmount));

    // Update purchase order
    const updated = await prisma.$transaction(async (tx) => {
      // If details provided, delete old details and create new ones
      if (data.details) {
        await tx.purchaseOrderDetail.deleteMany({
          where: { poId: id },
        });
      }

      return await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId,
          ...(data.orderDate && { orderDate: new Date(data.orderDate as string) }),
          ...(data.expectedDeliveryDate !== undefined && {
            expectedDeliveryDate: data.expectedDeliveryDate
              ? new Date(data.expectedDeliveryDate as string)
              : null,
          }),
          ...(data.notes !== undefined && { notes: data.notes }),
          taxAmount,
          discountAmount,
          otherCosts,
          subTotal,
          totalAmount,
          ...(data.isAutoApprove !== undefined && { 
            status: data.isAutoApprove ? 'approved' : 'pending',
            approvedBy: data.isAutoApprove ? userId : null
          }),
          ...(data.details && {
            details: {
              create: data.details.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                baseQuantity: item.baseQuantity ?? item.quantity,
                conversionFactor: item.conversionFactor ?? 1,
                price: item.price,
                discountRate: item.discountRate ?? 0,
                discountAmount: item.discountAmount ?? 0,
                taxRate: item.taxRate,
                taxIds: item.taxIds ? (item.taxIds as any) : undefined,
                taxAmount: item.taxAmount ?? 0,
                total: item.total ?? (item.price * item.quantity + (item.taxAmount ?? 0) - (item.discountAmount ?? 0)),
                periodMonths: item.periodMonths,
                warrantyCost: item.warrantyCost ?? 0,
                applyWarranty: item.applyWarranty ?? false,
                unitId: item.unitId,
                unitName: item.unitName,
                notes: item.notes,
              })),
            },
          }),
        },
        include: {
          supplier: true,
          creator: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              phone: true,
              email: true,
            },
          },
          details: {
            include: {
              product: true,
            },
          },
        },
      });
    });

    // Log activity
    logActivity('update', userId, 'purchase_orders', {
      recordId: id,
      poCode: purchaseOrder.poCode,
    });

    return updated;
  }

  async approve(id: number, userId: number, notes?: string) {
    const purchaseOrder = await this.getById(id);

    if (purchaseOrder.status !== 'pending') {
      throw new ValidationError(`Đơn mua ở trạng thái ${purchaseOrder.status}`);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: userId,
        notes: notes
          ? `${purchaseOrder.notes || ''}\nApproval notes: ${notes}`
          : purchaseOrder.notes,
      },
      include: {
        supplier: true,
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            phone: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    // Log activity
    logActivity('update', userId, 'purchase_orders', {
      recordId: id,
      poCode: purchaseOrder.poCode,
      action: 'approve',
    });

    return updated;
  }

  async sendEmail(id: number, userId: number) {
    const purchaseOrder = await this.getById(id);

    if (purchaseOrder.status !== 'approved') {
      throw new ValidationError('Đơn đặt hàng phải được phê duyệt.');
    }

    try {
      await sendPurchaseOrderEmail.sendPurchaseOrderEmail(purchaseOrder);
    } catch (error) {
      throw new Error('Lỗi không gửi được email');
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
      },
      include: {
        supplier: true,
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            phone: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    logActivity('send email', userId, 'purchase_orders', {
      recordId: id,
      poCode: purchaseOrder.poCode,
      action: 'sendEmail',
    });

    return updated;
  }

  async receive(_id: number, _userId: number, _data?: ReceivePurchaseOrderInput) {
    return 1;
  }

  async cancel(id: number, userId: number, reason?: string) {
    const purchaseOrder = await this.getById(id);

    if (purchaseOrder.status !== 'pending' && purchaseOrder.status !== 'approved') {
      throw new ValidationError(
        'Chỉ những đơn đặt hàng đang chờ xử lý hoặc đã được phê duyệt mới có thể bị hủy.'
      );
    }

    // Check for warehouse receipts (StockTransaction)
    const warehouseReceipts = await prisma.stockTransaction.count({
      where: {
        referenceType: 'purchase_order',
        referenceId: id,
        deletedAt: null,
      },
    });

    if (warehouseReceipts > 0) {
      throw new ValidationError(
        'Không thể hủy đơn đặt hàng đã có phiếu nhập kho. Vui lòng xóa phiếu nhập kho trước.'
      );
    }

    // Check for payment vouchers
    // Note: PaymentVoucher usually has a supplier but might refer to PO via notes or reference field if added.
    // However, the user said "phiếu chi", which might be linked to this PO's debt.
    // If the PO has paidAmount > 0, it definitely has payments.
    if (Number(purchaseOrder.paidAmount) > 0) {
        throw new ValidationError(
          'Không thể hủy đơn đặt hàng đã có phiếu chi (đã thanh toán một phần hoặc toàn bộ). Vui lòng xóa phiếu chi trước.'
        );
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'cancelled',
        notes: reason ? `${purchaseOrder.notes || ''} - Lý do hủy: ${reason}` : purchaseOrder.notes,
      },
      include: {
        supplier: true,
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            phone: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    // Log activity
    logActivity('update', userId, 'purchase_orders', {
      recordId: id,
      poCode: purchaseOrder.poCode,
      action: 'cancel',
      reason,
    });

    return updated;
  }

  async delete(id: number, userId: number) {
    const purchaseOrder = await this.getById(id);

    if (!['pending', 'cancelled'].includes(purchaseOrder.status)) {
      throw new ValidationError('Chỉ những đơn đặt hàng đang chờ xử lý hoặc đã hủy mới có thể bị xóa.');
    }

    // Soft delete
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    // Log activity
    logActivity('delete', userId, 'purchase_orders', {
      recordId: id,
      poCode: purchaseOrder.poCode,
    });

    return {
      success: true,
      message: 'Đơn đặt hàng đã được xóa thành công',
      timestamp: new Date().toISOString(),
    };
  }

  async revert(id: number, userId: number) {
    const purchaseOrder = await this.getById(id);

    if (purchaseOrder.status !== 'approved') {
      throw new ValidationError('Chỉ có thể revert đơn hàng từ trạng thái đã phê duyệt.');
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'pending',
      },
      include: {
        supplier: true,
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            phone: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    logActivity('revert', userId, 'purchase_orders', {
      recordId: id,
      poCode: purchaseOrder.poCode,
      action: 'revert',
    });

    return updated;
  }

  async processReturn(id: number, userId: number, data: ReturnPurchaseOrderInput) {
    const purchaseOrder = await this.getById(id) as any;

    if (purchaseOrder.status === 'pending' || purchaseOrder.status === 'cancelled') {
      throw new ValidationError('Chỉ đơn mua đã duyệt, đang giao hoặc hoàn thành mới có thể trả hàng');
    }

    let totalExportQty = 0;
    let totalExportValue = 0;
    const exportDetails: any[] = [];

    await prisma.$transaction(async (tx) => {
      let isPoChanged = false;
      let newSubTotal = Number(purchaseOrder.subTotal);

      // Process each item
      for (const reqItem of data.items) {
        const poDetail = purchaseOrder.details.find((d: PurchaseOrderDetail) => d.productId === reqItem.productId);
        if (!poDetail) {
          throw new ValidationError(`Sản phẩm (ID: ${reqItem.productId}) không tồn tại trong đơn mua này`);
        }

        const totalReturnQty = reqItem.cancelQty + reqItem.exportQty;
        if (totalReturnQty > 0) {
          // Reduce the PO detail quantity directly
          const newQty = Number(poDetail.quantity) - totalReturnQty;
          if (newQty < 0) {
            throw new ValidationError('Số lượng hủy hoặc hoàn trả lớn hơn số lượng trong đơn mua');
          }

          const price = Number(poDetail.price);
          const oldTotal = Number(poDetail.quantity) * price;
          const newTotal = newQty * price;

          // Adjust the subtotal based on old vs new total of this item
          newSubTotal = newSubTotal - oldTotal + newTotal;
          isPoChanged = true;

          // Update PO detail
          await tx.purchaseOrderDetail.update({
            where: { id: poDetail.id },
            data: { 
              quantity: newQty,
              total: newTotal
            }
          });
        }

        if (reqItem.exportQty > 0) {
          totalExportQty += reqItem.exportQty;
          totalExportValue += reqItem.exportQty * Number(poDetail.price);

          exportDetails.push({
            productId: reqItem.productId,
            quantity: reqItem.exportQty,
            notes: `Trả lại: ${reqItem.exportQty} (từ Đơn mua: ${purchaseOrder.poCode})`
          });
        }
      }

      // If PO was changed, recalculate PO level totals and save
      if (isPoChanged) {
        // Here we keep discount and tax conceptually the same, or recalculate if needed. 
        // For simplicity, we just adjust the totalAmount by the reduction in subTotal
        const subTotalDiff = Number(purchaseOrder.subTotal) - newSubTotal;
        const newTotalAmount = Math.max(0, Number(purchaseOrder.totalAmount) - subTotalDiff);
        
        // Cần đảm bảo newSubTotal không âm
        if (newSubTotal < 0) newSubTotal = 0;

        await tx.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: {
            subTotal: newSubTotal,
            totalAmount: newTotalAmount,
          }
        });
      }
    });

    logActivity('update', userId, 'purchase_orders', {
      recordId: id,
      poCode: purchaseOrder.poCode,
      action: 'process_return',
      details: data
    });

    // Sau khi cập nhật Đơn mua xong, nếu có hàng cần xuất trả -> tự động gọi tạo Phiếu xuất kho
    let generatedExportReceipt = null;
    if (totalExportQty > 0) {
      generatedExportReceipt = await stockTransactionService.createExport(
        {
          warehouseId: data.warehouseId,
          referenceType: 'purchase_refunds',
          referenceId: purchaseOrder.id,
          supplierId: purchaseOrder.supplierId,
          actualReceiptDate: data.actualDate || undefined,
          reason: data.reason || 'Trả hàng cho nhà cung cấp',
          notes: data.notes || `Trả hàng từ đơn ${purchaseOrder.poCode}`,
          details: exportDetails
        },
        userId
      );
    }

    return {
      message: 'Xử lý trả hàng thành công',
      totalExportQty,
      totalExportValue,
      generatedExportReceipt
    };
  }
}

export default new PurchaseOrderService();
