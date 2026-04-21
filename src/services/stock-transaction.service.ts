import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import inventoryService from './inventory.service';
import invoiceService from './invoice.service';
import smartDebtService from './smart-debt.service';
import paymentReceiptService from './payment-receipt.service';
import {
  type CreateImportInput,
  type CreateExportInput,
  type TransactionQueryInput,
} from '@validators/stock-transaction.validator';
const prisma = new PrismaClient();

class StockTransactionService {
  private async generateTransactionCode(type: string): Promise<string> {
    const prefixes: Record<string, string> = {
      import: 'PNK',
      export: 'PXK',
      transfer: 'PCK',
      disposal: 'PXH',
      stocktake: 'PKK',
    };

    const prefix = prefixes[type] || 'STK';
    const date = new Date();
    // Use local time for date string to avoid timezone shift at midnight UTC
    const dateStr = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('');

    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    // Get the latest transaction of this type today
    const latestTx = await prisma.stockTransaction.findFirst({
      where: {
        transactionType: type as any,
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        transactionCode: true,
      },
    });

    let nextSequence = 1;
    if (latestTx && latestTx.transactionCode.includes(dateStr)) {
      const parts = latestTx.transactionCode.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          nextSequence = lastSeq + 1;
        }
      }
    }

    const sequence = nextSequence.toString().padStart(3, '0');
    return `${prefix}-${dateStr}-${sequence}`;
  }

  async getAll(query: TransactionQueryInput) {
    const {
      page = '1',
      limit = '20',
      search = '',
      transactionType,
      warehouseId,
      referenceType,
      referenceId,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.StockTransactionWhereInput = {
      ...(search && {
        OR: [
          { transactionCode: { contains: search } },
          { creator: { fullName: { contains: search } } },
        ],
      }),
      ...(transactionType && { transactionType: transactionType as any }),
      ...(typeof (query as any).isPosted !== 'undefined' && { isPosted: (query as any).isPosted === 'true' }),
      ...(warehouseId && { warehouseId: parseInt(warehouseId) }),
      ...(referenceType && { referenceType }),
      ...(referenceId && { referenceId: parseInt(referenceId) }),
      ...(fromDate &&
        toDate && {
        createdAt: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
      }),
    };

    const total = await prisma.stockTransaction.count({ where });

    const transactions = await prisma.stockTransaction.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            warehouseName: true,
            warehouseCode: true,
            warehouseType: true,
          },
        },
        sourceWarehouse: {
          select: {
            id: true,
            warehouseName: true,
            warehouseCode: true,
          },
        },
        destinationWarehouse: {
          select: {
            id: true,
            warehouseName: true,
            warehouseCode: true,
          },
        },
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        details: true,
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

    const result = {
      data: transactions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      message: 'Success',
    };

    return result;
  }

  async getById(id: number) {
    const transaction = await prisma.stockTransaction.findUnique({
      where: { id },
      include: {
        warehouse: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
        creator: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
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
            warehouse: {
              select: {
                id: true,
                warehouseName: true,
                warehouseCode: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundError('Stock transaction');
    }

    // Attach external relations manually if needed
    const result: any = { ...transaction };
    if (transaction.customerId && !result.customer) {
      result.customer = await prisma.customer.findUnique({ where: { id: transaction.customerId } });
    }
    if (transaction.supplierId && !result.supplier) {
      result.supplier = await prisma.supplier.findUnique({ where: { id: transaction.supplierId } });
    }
    if (transaction.referenceType === 'invoice' && transaction.referenceId && !result.invoice) {
      result.invoice = await prisma.invoice.findUnique({ 
        where: { id: transaction.referenceId },
        include: { customer: true }
      });
      if (result.invoice?.customer && !result.customer) {
        result.customer = result.invoice.customer;
      }
    } else if (transaction.referenceType === 'purchase_order' && transaction.referenceId && !result.purchaseOrder) {
      result.purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: transaction.referenceId } });
    }

    return result;
  }

  async createImport(data: CreateImportInput, userId: number) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
    });

    if (!warehouse) {
      throw new NotFoundError('Warehouse');
    }

    for (const detail of data.details) {
      const product = await prisma.product.findUnique({
        where: { id: detail.productId },
      });
      if (!product) {
        throw new NotFoundError(`Sản phẩm với ID ${detail.productId}`);
      }
    }

    let transactionCode = await this.generateTransactionCode('import');
    let transaction;
    let retries = 3;

    while (retries > 0) {
      try {
        transaction = await prisma.stockTransaction.create({
          data: {
            transactionCode,
            transactionType: 'import',
            warehouseId: data.warehouseId,
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            customerId: data.customerId,
            supplierId: data.supplierId,
            reason: data.reason,
            notes: data.notes,
            actualReceiptDate: data.actualReceiptDate ? new Date(data.actualReceiptDate) : null,
            isPosted: false,
            createdBy: userId,
            details: {
              create: data.details.map((item) => ({
                productId: item.productId,
                unitId: item.unitId,
                warehouseId: data.warehouseId,
                quantity: item.quantity,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
                notes: item.notes,
              })),
            },
          },
          include: {
            details: {
              include: {
                product: true,
              },
            },
            warehouse: true,
            creator: true,
          },
        });
        break; // Sucesss
      } catch (error: any) {
        if (error.code === 'P2002' && error.meta?.target === 'stock_transactions_transaction_code_key') {
          retries--;
          if (retries === 0) throw error;
          // Generate an entirely new random string tail instead to ensure uniqueness if concurrent
          transactionCode = `${transactionCode}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        } else {
          throw error;
        }
      }
    }

    if (!transaction) throw new Error("Failed to create transaction");

    logActivity('create', userId, 'stock_transactions', {
      recordId: transaction.id,
      newValue: transaction,
    });

    // ✅ Auto-sync công nợ khi tạo phiếu nhập trả hàng (sale_refunds)
    if (data.referenceType === 'sale_refunds' && data.referenceId) {
      this._autoSyncDebtAfterReturn('customer', data.referenceId);
    }

    return transaction;
  }

  async createExport(data: CreateExportInput, userId: number) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError('Warehouse');
    }

    // Note: Do not strictly block creation of draft exports. Inventory will be verified upon posting.

    let transactionCode = await this.generateTransactionCode('export');

    if (data.referenceType === 'invoice' && data.referenceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: data.referenceId },
        select: { orderCode: true }
      });
      if (invoice?.orderCode) {
        if (invoice.orderCode.startsWith('DB-')) {
          transactionCode = 'XK-' + invoice.orderCode.substring(3);
        } else {
          transactionCode = 'XK-' + invoice.orderCode;
        }
      }
    }

    let transaction;
    let retries = 3;

    while (retries > 0) {
      try {
        transaction = await prisma.stockTransaction.create({
          data: {
            transactionCode,
            transactionType: 'export',
        warehouseId: data.warehouseId,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        customerId: data.customerId,
        supplierId: data.supplierId,
        reason: data.reason,
        notes: data.notes,
        actualReceiptDate: data.actualReceiptDate ? new Date(data.actualReceiptDate) : null,
        isPosted: false,
        createdBy: userId,
        details: {
          create: data.details.map((item) => ({
            productId: item.productId,
            unitId: item.unitId,
            warehouseId: data.warehouseId,
            quantity: item.quantity,
            batchNumber: item.batchNumber,
            notes: item.notes,
          })),
        },
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
        warehouse: true,
        creator: true,
      },
    });
        break;
      } catch (error: any) {
        if (error.code === 'P2002' && error.meta?.target === 'stock_transactions_transaction_code_key') {
          retries--;
          if (retries === 0) throw error;
          transactionCode = `${transactionCode}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        } else {
          throw error;
        }
      }
    }

    if (!transaction) throw new Error("Failed to create transaction");

    // ✅ Tự động tạo phiếu thu hoàn tiền nếu là trả hàng nhà cung cấp
    if (data.referenceType === 'purchase_refunds' && data.referenceId && data.supplierId) {
      this._autoCreateRefundReceipt(transaction, userId).catch(err => 
        console.error(`[AutoReceipt] Failed to create refund receipt for transaction ${transaction.id}:`, err.message)
      );
    }

    logActivity('create', userId, 'stock_transactions', {
      recordId: transaction.id,
      newValue: transaction,
    });

    return transaction;
  }

  /**
   * Tự động tạo phiếu thu hoàn tiền khi tạo phiếu trả hàng
   */
  private async _autoCreateRefundReceipt(transaction: any, userId: number) {
    try {
      // Tính tổng tiền hoàn trả dựa trên đơn giá trong đơn mua
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: transaction.referenceId },
        include: { details: true }
      });

      if (!po) return;

      let refundAmount = 0;
      for (const detail of transaction.details) {
        const poDetail = po.details.find(d => d.productId === detail.productId);
        if (poDetail) {
          refundAmount += Number(detail.quantity) * Number(poDetail.price);
        }
      }

      console.log(`💰 [AutoReceipt] Creating refund receipt for PO ${po.poCode}, amount: ${refundAmount}`);
      
      await paymentReceiptService.create({
        receiptType: 'refund',
        supplierId: transaction.supplierId,
        purchaseOrderId: transaction.referenceId,
        amount: refundAmount,
        paymentMethod: 'cash', // Mặc định tiền mặt, user có thể sửa sau
        receiptDate: new Date().toISOString(),
        notes: `Hoàn tiền tự động từ phiếu trả hàng ${transaction.transactionCode}`,
      }, userId);
    } catch (error: any) {
      console.error(`[AutoReceipt] Error:`, error.message);
    }
  }

  async createTransfer(
    data: {
      sourceWarehouseId: number;
      destinationWarehouseId: number;
      reason?: string;
      notes?: string;
      details: Array<{
        productId: number;
        quantity: number;
        batchNumber?: string;
        notes?: string;
      }>;
    },
    userId: number
  ) {
    const sourceWarehouse = await prisma.warehouse.findUnique({
      where: { id: data.sourceWarehouseId },
    });
    if (!sourceWarehouse) {
      throw new NotFoundError('Source warehouse');
    }

    const destWarehouse = await prisma.warehouse.findUnique({
      where: { id: data.destinationWarehouseId },
    });
    if (!destWarehouse) {
      throw new NotFoundError('Destination warehouse');
    }

    if (data.sourceWarehouseId === data.destinationWarehouseId) {
      throw new ValidationError('Source and destination warehouses must be different');
    }

    const checkResult = await inventoryService.checkAvailability(
      data.details.map((d) => ({
        productId: d.productId,
        warehouseId: data.sourceWarehouseId,
        quantity: d.quantity,
      }))
    );

    if (!checkResult.allAvailable) {
      throw new ValidationError('Insufficient inventory in source warehouse', {
        unavailableItems: checkResult.items.filter((i) => !i.isAvailable),
      });
    }

    const transactionCode = await this.generateTransactionCode('transfer');

    const transaction = await prisma.stockTransaction.create({
      data: {
        transactionCode,
        transactionType: 'transfer',
        warehouseId: data.sourceWarehouseId,
        sourceWarehouseId: data.sourceWarehouseId,
        destinationWarehouseId: data.destinationWarehouseId,
        reason: data.reason,
        notes: data.notes,
        createdBy: userId,
        details: {
          create: data.details.map((item) => ({
            productId: item.productId,
            warehouseId: data.sourceWarehouseId,
            quantity: item.quantity,
            batchNumber: item.batchNumber,
            notes: item.notes,
          })),
        },
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
        sourceWarehouse: true,
        destinationWarehouse: true,
        creator: true,
      },
    });

    logActivity('create', userId, 'stock_transactions', {
      recordId: transaction.id,
      newValue: transaction,
    });

    return transaction;
  }

  async createDisposal(
    data: {
      warehouseId: number;
      reason: string;
      notes?: string;
      details: Array<{
        productId: number;
        quantity: number;
        batchNumber?: string;
        notes?: string;
      }>;
    },
    userId: number
  ) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError('Warehouse');
    }

    const checkResult = await inventoryService.checkAvailability(
      data.details.map((d) => ({
        productId: d.productId,
        warehouseId: data.warehouseId,
        quantity: d.quantity,
      }))
    );

    if (!checkResult.allAvailable) {
      throw new ValidationError('Insufficient inventory for disposal', {
        unavailableItems: checkResult.items.filter((i) => !i.isAvailable),
      });
    }

    const transactionCode = await this.generateTransactionCode('disposal');

    const transaction = await prisma.stockTransaction.create({
      data: {
        transactionCode,
        transactionType: 'disposal',
        warehouseId: data.warehouseId,
        reason: data.reason,
        notes: data.notes,
        createdBy: userId,
        details: {
          create: data.details.map((item) => ({
            productId: item.productId,
            warehouseId: data.warehouseId,
            quantity: item.quantity,
            batchNumber: item.batchNumber,
            notes: item.notes,
          })),
        },
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
        warehouse: true,
        creator: true,
      },
    });

    logActivity('create', userId, 'stock_transactions', {
      recordId: transaction.id,
      newValue: transaction,
    });

    return transaction;
  }

  async createStocktake(
    data: {
      warehouseId: number;
      reason?: string;
      notes?: string;
      details: Array<{
        productId: number;
        systemQuantity: number;
        actualQuantity: number;
        batchNumber?: string;
        notes?: string;
      }>;
    },
    userId: number
  ) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError('Warehouse');
    }

    const transactionCode = await this.generateTransactionCode('stocktake');

    const details = data.details.map((item) => ({
      productId: item.productId,
      warehouseId: data.warehouseId,
      quantity: item.actualQuantity - item.systemQuantity,
      batchNumber: item.batchNumber,
      notes: item.notes
        ? `${item.notes} (System: ${item.systemQuantity}, Actual: ${item.actualQuantity})`
        : `System: ${item.systemQuantity}, Actual: ${item.actualQuantity}`,
    }));

    const transaction = await prisma.stockTransaction.create({
      data: {
        transactionCode,
        transactionType: 'stocktake',
        warehouseId: data.warehouseId,
        reason: data.reason,
        notes: data.notes,
        createdBy: userId,
        details: {
          create: details,
        },
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
        warehouse: true,
        creator: true,
      },
    });

    logActivity('create', userId, 'stock_transactions', {
      recordId: transaction.id,
      newValue: transaction,
    });

    return transaction;
  }

  async updateTransaction(id: number, data: { notes?: string; reason?: string; details?: Array<{ id?: number; productId: number; unitId?: number; quantity: number; notes?: string; batchNumber?: string }> }, userId: number) {
    const transaction = await this.getById(id);


    const updateData: any = {};
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.reason !== undefined) updateData.reason = data.reason;

    const result = await prisma.$transaction(async (tx) => {
      // Update main transaction
      const updated = await tx.stockTransaction.update({
        where: { id },
        data: updateData,
        include: {
          details: { include: { product: true } },
          warehouse: true,
          creator: true,
        },
      });

      // Update details if provided
      if (data.details && data.details.length > 0) {
        if (transaction.isPosted) {
          // Giao dịch đã ghi sổ, chỉ cho phép cập nhật ghi chú của chi tiết sản phẩm
          for (const item of data.details) {
            const existingDetail = updated.details.find((d: any) =>
              (item.id && d.id === item.id) ||
              (!item.id && d.productId === item.productId && (d.unitId === item.unitId || (!d.unitId && !item.unitId)))
            );
            if (existingDetail) {
              await tx.stockTransactionDetail.update({
                where: { id: existingDetail.id },
                data: { notes: item.notes || '' },
              });
            }
          }
        } else {
          // Chưa ghi sổ, xóa chi tiết cũ và tạo lại
          await tx.stockTransactionDetail.deleteMany({ where: { transactionId: id } });
          await tx.stockTransactionDetail.createMany({
            data: data.details.map((item) => ({
              transactionId: id,
              productId: item.productId,
              unitId: item.unitId,
              warehouseId: transaction.warehouseId,
              quantity: item.quantity,
              batchNumber: item.batchNumber,
              notes: item.notes,
            })),
          });
        }
      }

      return updated;
    });

    logActivity('update', userId, 'stock_transactions', {
      recordId: id,
      newValue: result,
    });

    return await this.getById(id);
  }

  async postTransaction(id: number, userId: number, notes?: string) {
    const transaction = await this.getById(id);

    if (transaction.isPosted) {
      throw new ValidationError(`Giao dịch đã được ghi sổ.`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.stockTransaction.update({
        where: { id },
        data: {
          isPosted: true,
          notes: notes ? `${transaction.notes || ''} - Ghi sổ: ${notes}` : transaction.notes,
        },
        include: {
          details: {
            include: {
              product: true,
            },
          },
          warehouse: true,
          sourceWarehouse: true,
          destinationWarehouse: true,
        },
      });

      switch (transaction.transactionType) {
        case 'import':
          await this.processImport(tx, transaction, userId);
          break;
        case 'export':
          await this.processExport(tx, transaction, userId);
          break;
        case 'transfer':
          await this.processTransfer(tx, transaction, userId);
          break;
        case 'disposal':
          await this.processDisposal(tx, transaction, userId);
          break;
        case 'stocktake':
          await this.processStocktake(tx, transaction, userId);
          break;
      }

      return updatedTransaction;
    });

    logActivity('update', userId, 'stock_transactions', {
      recordId: id,
      action: 'post',
      oldValue: { isPosted: false },
      newValue: { isPosted: true },
    });

    // ✅ Auto-sync công nợ sau khi ghi sổ phiếu trả hàng
    if (transaction.referenceType === 'sale_refunds' && transaction.referenceId) {
      this._autoSyncDebtAfterReturn('customer', transaction.referenceId);
    } else if (transaction.referenceType === 'purchase_refunds' && transaction.referenceId) {
      this._autoSyncDebtAfterReturn('supplier', transaction.referenceId);
    }

    return result;
  }

  private async processImport(tx: any, transaction: any, userId: number) {
    for (const detail of transaction.details) {
      const current = await tx.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.warehouseId,
            productId: detail.productId,
          },
        },
      });

      const newQuantity = (current ? Number(current.quantity) : 0) + Number(detail.quantity);

      const inventory = await tx.inventory.upsert({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.warehouseId,
            productId: detail.productId,
          },
        },
        create: {
          warehouseId: transaction.warehouseId,
          productId: detail.productId,
          quantity: newQuantity,
          reservedQuantity: 0,
          updatedBy: userId,
        },
        update: {
          quantity: newQuantity,
          updatedBy: userId,
        },
      });

      // Cập nhật lô hàng (InventoryBatch) cho FEFO/FIFO nếu có số lô và HSD
      if (detail.batchNumber && detail.expiryDate) {
        await tx.inventoryBatch.upsert({
          where: {
            inventoryId_batchNumber_expiryDate: {
              inventoryId: inventory.id,
              batchNumber: detail.batchNumber,
              expiryDate: new Date(detail.expiryDate),
            },
          },
          create: {
            inventoryId: inventory.id,
            warehouseId: transaction.warehouseId,
            productId: detail.productId,
            batchNumber: detail.batchNumber,
            expiryDate: new Date(detail.expiryDate),
            quantity: Number(detail.quantity),
            updatedBy: userId,
          },
          update: {
            quantity: { increment: Number(detail.quantity) },
            updatedBy: userId,
          },
        });
      }

      // Removed mapping to product.purchasePrice and expiryDate since those fields 
      // are no longer stored on the Product model directly.
    }

    // Ghi nhận công nợ phải trả cho supplier (nếu là purchase order)
    if (transaction.referenceType === 'purchase_order' && transaction.referenceId) {
      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id: transaction.referenceId },
      });

      if (purchaseOrder) {
        // Lấy supplier hiện tại
        const supplier = await tx.supplier.findUnique({
          where: { id: purchaseOrder.supplierId },
        });

        // Tính công nợ mới = công nợ cũ + tiền đơn hàng
        const newPayable =
          (supplier ? Number(supplier.totalPayable) || 0 : 0) + Number(purchaseOrder.totalAmount);

        // Update supplier debt
        await tx.supplier.update({
          where: { id: purchaseOrder.supplierId },
          data: {
            totalPayable: newPayable,
            payableUpdatedAt: new Date(),
          },
        });

        // Cập nhật PO status → 'received'
        await tx.purchaseOrder.update({
          where: { id: transaction.referenceId },
          data: {
            status: 'received',
          },
        });
      }
    }
  }

  private async processExport(tx: any, transaction: any, userId: number) {
    for (const detail of transaction.details) {
      const current = await tx.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.warehouseId,
            productId: detail.productId,
          },
        },
      });

      if (!current) {
        throw new ValidationError(`No inventory found for product ${detail.productId}`);
      }

      const newQuantity = Number(current.quantity) - Number(detail.quantity);

      // if (newQuantity < 0) {
      //   throw new ValidationError(
      //     `Insufficient inventory for product ${detail.productId}`
      //   );
      // }

      // 1. FEFO Deduction from batches
      await inventoryService.deductInventoryBatchFEFO(
        tx,
        transaction.warehouseId,
        detail.productId,
        Number(detail.quantity),
        userId
      );

      // 2. Deduct from main inventory
      await tx.inventory.update({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.warehouseId,
            productId: detail.productId,
          },
        },
        data: {
          quantity: newQuantity,
          updatedBy: userId,
        },
      });
    }

    // ─── Tự động hoàn thành Invoice nếu đã xuất đủ số lượng ──────────────────
    if (transaction.referenceType === 'invoice' && transaction.referenceId) {
      const invoiceId = transaction.referenceId;

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { details: true },
      });

      if (invoice) {
        // Luôn chuyển sang trạng thái đang giao khi xuất kho (để phù hợp với kịch bản 1, 2, 3)
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { orderStatus: 'delivering' }
        });

        // Gọi logic kiểm tra hoàn thành tập trung
        await (invoiceService as any).checkAndCompleteOrder(invoiceId, userId, tx);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── Tự động tạo phiếu Chuyển kho nhập khi Xuất kho chuyển đi hoàn thành ─────
    if (transaction.referenceType === 'transfer_out' && transaction.referenceId) {
      const destWarehouseId = transaction.referenceId;
      const transactionCode = await this.generateTransactionCode('import');

      // Add a quick random hash to avoid code collisions when inside transaction
      const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      
      const autoImportTx = await tx.stockTransaction.create({
        data: {
          transactionCode: `${transactionCode}-${uniqueSuffix}`,
          transactionType: 'import',
          warehouseId: destWarehouseId,
          referenceType: 'transfer_in_auto',
          referenceId: transaction.warehouseId, // Source warehouse
          reason: transaction.reason || `Nhập kho tự động từ PX ${transaction.transactionCode}`,
          notes: transaction.notes,
          isPosted: true,
          createdBy: userId,
          details: {
            create: transaction.details.map((item: any) => ({
              productId: item.productId,
              unitId: item.unitId,
              warehouseId: destWarehouseId,
              quantity: item.quantity,
              batchNumber: item.batchNumber,
              notes: item.notes,
            })),
          },
        },
        include: {
          details: true,
        }
      });

      // Lập tức tăng tồn kho bên kho đích
      await this.processImport(tx, autoImportTx, userId);
    }
    // ─────────────────────────────────────────────────────────────────────────
  }

  private async processTransfer(tx: any, transaction: any, userId: number) {
    for (const detail of transaction.details) {
      const sourceInventory = await tx.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.sourceWarehouseId,
            productId: detail.productId,
          },
        },
      });

      if (!sourceInventory) {
        throw new ValidationError(
          `No inventory in source warehouse for product ${detail.productId}`
        );
      }

      const newSourceQty = Number(sourceInventory.quantity) - Number(detail.quantity);

      if (newSourceQty < 0) {
        throw new ValidationError(`Insufficient inventory in source warehouse`);
      }

      // FEFO Deduction from source warehouse batches
      const deductedBatches = await inventoryService.deductInventoryBatchFEFO(
        tx,
        transaction.sourceWarehouseId,
        detail.productId,
        Number(detail.quantity),
        userId
      );

      await tx.inventory.update({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.sourceWarehouseId,
            productId: detail.productId,
          },
        },
        data: {
          quantity: newSourceQty,
          updatedBy: userId,
        },
      });

      const destInventory = await tx.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.destinationWarehouseId,
            productId: detail.productId,
          },
        },
      });

      const newDestQty =
        (destInventory ? Number(destInventory.quantity) : 0) + Number(detail.quantity);

      await tx.inventory.upsert({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.destinationWarehouseId,
            productId: detail.productId,
          },
        },
        create: {
          warehouseId: transaction.destinationWarehouseId,
          productId: detail.productId,
          quantity: newDestQty,
          reservedQuantity: 0,
          updatedBy: userId,
        },
        update: {
          quantity: newDestQty,
          updatedBy: userId,
        },
      });

      // Add the deducted batches from source into the destination warehouse
      // We must query the newly upserted destInventory id to link batches
      const updatedDestInventory = await tx.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.destinationWarehouseId,
            productId: detail.productId,
          },
        },
      });

      if (updatedDestInventory) {
        for (const batch of deductedBatches) {
          if (batch.batchNumber && batch.expiryDate) {
            await tx.inventoryBatch.upsert({
              where: {
                inventoryId_batchNumber_expiryDate: {
                  inventoryId: updatedDestInventory.id,
                  batchNumber: batch.batchNumber,
                  expiryDate: new Date(batch.expiryDate),
                },
              },
              create: {
                inventoryId: updatedDestInventory.id,
                warehouseId: transaction.destinationWarehouseId,
                productId: detail.productId,
                batchNumber: batch.batchNumber,
                expiryDate: new Date(batch.expiryDate),
                quantity: batch.quantity,
                updatedBy: userId,
              },
              update: {
                quantity: { increment: batch.quantity },
                updatedBy: userId,
              },
            });
          }
        }
      }
    }
  }

  private async processDisposal(tx: any, transaction: any, userId: number) {
    // Same as export
    await this.processExport(tx, transaction, userId);
  }

  private async processStocktake(tx: any, transaction: any, userId: number) {
    for (const detail of transaction.details) {
      const adjustment = Number(detail.quantity);

      if (adjustment === 0) continue;

      const current = await tx.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.warehouseId,
            productId: detail.productId,
          },
        },
      });

      const currentQty = current ? Number(current.quantity) : 0;
      const newQuantity = currentQty + adjustment;

      if (newQuantity < 0) {
        throw new ValidationError(
          `Invalid stocktake: would result in negative inventory for product ${detail.productId}`
        );
      }

      await tx.inventory.upsert({
        where: {
          warehouseId_productId: {
            warehouseId: transaction.warehouseId,
            productId: detail.productId,
          },
        },
        create: {
          warehouseId: transaction.warehouseId,
          productId: detail.productId,
          quantity: newQuantity,
          reservedQuantity: 0,
          updatedBy: userId,
        },
        update: {
          quantity: newQuantity,
          updatedBy: userId,
        },
      });
    }
  }


  async quickAdjustInventory(
    data: {
      warehouseId: number;
      productId: number;
      adjustmentType: 'disposal' | 'stocktake';
      quantity: number;
      actualQuantity?: number;
      reason: string;
    },
    userId: number
  ) {
    // Validate warehouse
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError('Kho hàng');
    }

    // Validate product
    const product = await prisma.product.findUnique({
      where: { id: data.productId },
    });
    if (!product) {
      throw new NotFoundError('Sản phẩm');
    }

    // Get current inventory
    const currentInventory = await prisma.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: data.warehouseId,
          productId: data.productId,
        },
      },
    });

    if (!currentInventory) {
      throw new ValidationError('Không tìm thấy tồn kho cho sản phẩm này');
    }

    const currentQuantity = Number(currentInventory.quantity);
    let transactionQuantity = 0;
    let newInventoryQuantity = 0;

    if (data.adjustmentType === 'disposal') {
      // Disposal: subtract quantity
      if (data.quantity > currentQuantity) {
        throw new ValidationError(
          `Số lượng hủy (${data.quantity}) vượt quá tồn kho hiện tại (${currentQuantity})`
        );
      }
      transactionQuantity = data.quantity;
      newInventoryQuantity = currentQuantity - data.quantity;
    } else if (data.adjustmentType === 'stocktake') {
      // Stocktake: compare with actual quantity
      if (typeof data.actualQuantity !== 'number') {
        throw new ValidationError('Vui lòng nhập số lượng thực tế');
      }
      if (data.actualQuantity < 0) {
        throw new ValidationError('Số lượng thực tế không thể âm');
      }
      const difference = data.actualQuantity - currentQuantity;
      transactionQuantity = difference;
      newInventoryQuantity = data.actualQuantity;
    }

    // Generate transaction code
    const transactionCode = await this.generateTransactionCode(data.adjustmentType);

    // Create transaction with inventory update in atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create stock transaction
      const transaction = await tx.stockTransaction.create({
        data: {
          transactionCode,
          transactionType: data.adjustmentType,
          warehouseId: data.warehouseId,
          reason: data.reason,
          isPosted: true,
          createdBy: userId,
          details: {
            create: [
              {
                productId: data.productId,
                warehouseId: data.warehouseId,
                quantity: transactionQuantity,
                notes:
                  data.adjustmentType === 'stocktake'
                    ? `Kiểm kê: Hệ thống ${currentQuantity}, Thực tế ${data.actualQuantity
                    }, Chênh lệch ${transactionQuantity > 0 ? '+' : ''}${transactionQuantity}`
                    : data.reason,
              },
            ],
          },
        },
        include: {
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      // Update inventory
      const updatedInventory = await tx.inventory.update({
        where: {
          warehouseId_productId: {
            warehouseId: data.warehouseId,
            productId: data.productId,
          },
        },
        data: {
          quantity: newInventoryQuantity,
          updatedBy: userId,
        },
      });

      logActivity('create', userId, 'stock_transactions', {
        recordId: transaction.id,
        action: 'quick_adjust',
        newValue: {
          transactionCode: transaction.transactionCode,
          adjustmentType: data.adjustmentType,
          productId: data.productId,
          quantity: transactionQuantity,
          oldQuantity: currentQuantity,
          newQuantity: newInventoryQuantity,
        },
      });

      return {
        transaction,
        inventory: updatedInventory,
      };
    });

    return result;
  }

  async getStockCard(warehouseId: number, productId: number, startDate?: string, endDate?: string) {
    // Validate inputs
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError('Kho hàng');
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { unit: { select: { unitCode: true, unitName: true } } },
    });
    if (!product) {
      throw new NotFoundError('Sản phẩm');
    }

    // Default date range: last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get opening balance: sum of all transactions BEFORE start date
    const beforeStartTransactions = await prisma.stockTransactionDetail.findMany({
      where: {
        productId,
        transaction: {
          OR: [
            // Regular transactions (import, export, disposal, stocktake)
            {
              warehouseId,
              isPosted: true,
              transactionType: { in: ['import', 'export', 'disposal', 'stocktake'] as any },
              createdAt: { lt: start },
            },
            // Transfer transactions (from this warehouse)
            {
              sourceWarehouseId: warehouseId,
              isPosted: true,
              transactionType: 'transfer' as any,
              createdAt: { lt: start },
            },
            // Transfer transactions (to this warehouse)
            {
              destinationWarehouseId: warehouseId,
              isPosted: true,
              transactionType: 'transfer' as any,
              createdAt: { lt: start },
            },
          ],
        },
      },
      include: {
        transaction: {
          select: {
            transactionType: true,
            sourceWarehouseId: true,
            destinationWarehouseId: true,
          },
        },
      },
    });

    let openingBalance = 0;
    beforeStartTransactions.forEach((detail) => {
      if (['import'].includes(detail.transaction.transactionType)) {
        openingBalance += Number(detail.quantity);
      } else if (['export', 'disposal'].includes(detail.transaction.transactionType)) {
        openingBalance -= Number(detail.quantity);
      } else if (detail.transaction.transactionType === 'stocktake') {
        openingBalance += Number(detail.quantity);
      } else if (detail.transaction.transactionType === 'transfer') {
        // Transfer: subtract from source warehouse, add to destination
        if (detail.transaction.sourceWarehouseId === warehouseId) {
          openingBalance -= Number(detail.quantity);
        } else if (detail.transaction.destinationWarehouseId === warehouseId) {
          openingBalance += Number(detail.quantity);
        }
      }
    });

    // Get all transactions within date range
    const transactions = await prisma.stockTransactionDetail.findMany({
      where: {
        productId,
        transaction: {
          OR: [
            // Regular transactions
            {
              warehouseId,
              isPosted: true,
              transactionType: { in: ['import', 'export', 'disposal', 'stocktake'] as any },
              createdAt: {
                gte: start,
                lte: end,
              },
            },
            // Transfer transactions (from this warehouse)
            {
              sourceWarehouseId: warehouseId,
              isPosted: true,
              transactionType: 'transfer' as any,
              createdAt: {
                gte: start,
                lte: end,
              },
            },
            // Transfer transactions (to this warehouse)
            {
              destinationWarehouseId: warehouseId,
              isPosted: true,
              transactionType: 'transfer' as any,
              createdAt: {
                gte: start,
                lte: end,
              },
            },
          ],
        },
      },
      include: {
        transaction: {
          select: {
            id: true,
            transactionCode: true,
            transactionType: true,
            reason: true,
            notes: true,
            createdAt: true,
            referenceType: true,
            referenceId: true,
            sourceWarehouseId: true,
            destinationWarehouseId: true,
          },
        },
        product: {
          select: {
            id: true,
            code: true,
            productName: true,
            unitId: true,
            unit: { select: { unitCode: true, unitName: true } },
          },
        },
      },
      orderBy: {
        transaction: {
          createdAt: 'asc',
        },
      },
    });

    // Calculate balance for each transaction
    let balance = openingBalance;
    const processedTransactions = transactions.map((detail) => {
      if (['import'].includes(detail.transaction.transactionType)) {
        balance += Number(detail.quantity);
      } else if (['export', 'disposal'].includes(detail.transaction.transactionType)) {
        balance -= Number(detail.quantity);
      } else if (detail.transaction.transactionType === 'stocktake') {
        balance += Number(detail.quantity);
      } else if (detail.transaction.transactionType === 'transfer') {
        // Transfer: subtract from source warehouse, add to destination
        if (detail.transaction.sourceWarehouseId === warehouseId) {
          balance -= Number(detail.quantity);
        } else if (detail.transaction.destinationWarehouseId === warehouseId) {
          balance += Number(detail.quantity);
        }
      }

      return {
        id: detail.id,
        date: detail.transaction.createdAt,
        code: detail.transaction.transactionCode,
        type: detail.transaction.transactionType,
        description: this.getTransactionDescription(
          detail.transaction.transactionType,
          detail.transaction.reason || detail.transaction.notes || undefined
        ),
        quantity: Number(detail.quantity),
        batchNumber: detail.batchNumber || null,
        balance,
        referenceId: detail.transaction.referenceId,
        referenceType: detail.transaction.referenceType,
        transactionId: detail.transaction.id,
      };
    });

    // Calculate summary
    const summary = {
      totalImport: processedTransactions
        .filter((t) => t.type === 'import')
        .reduce((sum, t) => sum + t.quantity, 0),
      totalExport: processedTransactions
        .filter((t) => t.type === 'export')
        .reduce((sum, t) => sum + t.quantity, 0),
      totalDisposal: processedTransactions
        .filter((t) => t.type === 'disposal')
        .reduce((sum, t) => sum + t.quantity, 0),
      totalStocktake: processedTransactions
        .filter((t) => t.type === 'stocktake')
        .reduce((sum, t) => sum + Math.abs(t.quantity), 0),
      totalTransfer: processedTransactions
        .filter((t) => t.type === 'transfer')
        .reduce((sum, t) => sum + t.quantity, 0),
    };

    return {
      product: {
        id: product.id,
        code: product.code,
        productName: product.productName,
        unit: (product.unit as any)?.unitName || '',
      },
      warehouse: {
        id: warehouse.id,
        warehouseCode: warehouse.warehouseCode,
        warehouseName: warehouse.warehouseName,
      },
      openingBalance,
      closingBalance: balance,
      dateRange: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      },
      transactions: processedTransactions,
      summary,
    };
  }

  private getTransactionDescription(type: string, reason?: string): string {
    const descriptions: Record<string, string> = {
      import: 'Nhập kho',
      export: 'Xuất kho',
      transfer: 'Chuyển kho',
      disposal: 'Xuất hủy',
      stocktake: 'Kiểm kê',
    };
    const base = descriptions[type] || 'Giao dịch kho';
    return reason ? `${base} - ${reason}` : base;
  }

  /**
   * Fire-and-forget: Tự động đồng bộ công nợ sau khi tạo/ghi sổ phiếu trả hàng.
   * - sale_refunds → tìm customerId qua Invoice → syncSnap customer
   * - purchase_refunds → tìm supplierId qua PurchaseOrder → syncSnap supplier
   */
  private _autoSyncDebtAfterReturn(type: 'customer' | 'supplier', referenceId: number) {
    const year = new Date().getFullYear();

    if (type === 'customer') {
      // sale_refunds: referenceId = invoiceId → lấy customerId
      prisma.invoice.findUnique({
        where: { id: referenceId },
        select: { customerId: true },
      }).then((invoice) => {
        if (!invoice?.customerId) return;
        console.log(`🔄 [AutoSync] Triggering debt sync for Customer ${invoice.customerId} after return goods`);
        smartDebtService.syncSnap({ customerId: invoice.customerId, year }).then(async () => {
          // Tự động kiểm tra và hoàn thành đơn hàng sau khi đồng bộ trừ công nợ (vì hàng đã trả đủ)
          try {
            await prisma.$transaction(async (tx) => {
              await invoiceService.checkAndCompleteOrder(referenceId, 1, tx); // userId 1 for system action
            });
            console.log(`✅ [AutoSync] Auto-check complete order ${referenceId} successful`);
          } catch (syncErr: any) {
            console.error(`❌ [AutoSync] Failed to auto-check complete order ${referenceId}:`, syncErr.message);
          }
        }).catch((err) =>
          console.error(`[AutoSync] Failed to sync debt for customer ${invoice.customerId}:`, err.message)
        );
      }).catch((err) => {
        console.error(`[AutoSync] Failed to resolve customer from invoice ${referenceId}:`, err.message);
      });
    } else if (type === 'supplier') {
      // purchase_refunds: referenceId = purchaseOrderId → lấy supplierId
      prisma.purchaseOrder.findUnique({
        where: { id: referenceId },
        select: { supplierId: true },
      }).then((po) => {
        if (!po?.supplierId) return;
        console.log(`🔄 [AutoSync] Triggering debt sync for Supplier ${po.supplierId} after return goods`);
        smartDebtService.syncSnap({ supplierId: po.supplierId, year }).catch((err) =>
          console.error(`[AutoSync] Failed to sync debt for supplier ${po.supplierId}:`, err.message)
        );
      }).catch((err) => {
        console.error(`[AutoSync] Failed to resolve supplier from PO ${referenceId}:`, err.message);
      });
    }
  }

  async deleteTransaction(id: number, userId: number) {
    const transaction = await this.getById(id);

    if (transaction.isPosted) {
      throw new ValidationError('Không thể xóa phiếu kho đã ghi sổ');
    }

    logActivity('delete', userId, 'stock_transactions', {
      recordId: id,
      oldValue: transaction,
    });

    const deleted = await prisma.$transaction(async (tx) => {
      // First delete details
      await tx.stockTransactionDetail.deleteMany({
        where: { transactionId: id }
      });
      // Then delete transaction
      return await tx.stockTransaction.delete({
        where: { id }
      });
    });

    return deleted;
  }
}

export default new StockTransactionService();
