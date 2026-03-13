import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import inventoryService from './inventory.service';
import {
  type CreateImportInput,
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
      status,
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
      ...(status && { status: status as any }),
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
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
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
        approver: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
          },
        },
        canceller: {
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

    return transaction;
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

    const totalValue = data.details.reduce(
      (sum, item) => sum + (item.unitPrice || 0) * item.quantity,
      0
    );

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
            totalValue,
            reason: data.reason,
            notes: data.notes,
            status: 'pending',
            createdBy: userId,
            details: {
              create: data.details.map((item) => ({
                productId: item.productId,
                warehouseId: data.warehouseId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
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

    return transaction;
  }

  async createExport(
    data: {
      warehouseId: number;
      referenceType?: string;
      referenceId?: number;
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
      throw new ValidationError('Insufficient inventory for export', {
        unavailableItems: checkResult.items.filter((i) => !i.isAvailable),
      });
    }

    const transactionCode = await this.generateTransactionCode('export');

    const transaction = await prisma.stockTransaction.create({
      data: {
        transactionCode,
        transactionType: 'export',
        warehouseId: data.warehouseId,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        reason: data.reason,
        notes: data.notes,
        status: 'draft',
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
        status: 'pending',
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
        status: 'pending',
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
        status: 'pending',
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

  async approve(id: number, userId: number, notes?: string) {
    const transaction = await this.getById(id);

    if (transaction.status !== 'pending' && transaction.status !== 'draft') {
      throw new ValidationError(`Giao dịch không thể phê duyệt. Trạng thái: ${transaction.status}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.stockTransaction.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          notes: notes ? `${transaction.notes || ''} - Phê duyệt: ${notes}` : transaction.notes,
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
      action: 'approve',
      oldValue: { status: transaction.status },
      newValue: { status: 'approved' },
    });

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

      if (newQuantity < 0) {
        throw new ValidationError(
          `Insufficient inventory for product ${detail.productId}`
        );
      }

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

  async cancel(id: number, userId: number, reason: string) {
    const transaction = await this.getById(id);

    if (transaction.status === 'cancelled') {
      throw new ValidationError('Transaction is already cancelled');
    }

    if (transaction.status === 'approved') {
      throw new ValidationError(
        'Cannot cancel approved transaction. Please create a reversal transaction instead.'
      );
    }

    const updated = await prisma.stockTransaction.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledBy: userId,
        cancelledAt: new Date(),
        notes: `${transaction.notes || ''}\nCancellation reason: ${reason}`,
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
        warehouse: true,
      },
    });

    logActivity('update', userId, 'stock_transactions', {
      recordId: id,
      action: 'cancel',
      oldValue: { status: transaction.status },
      newValue: { status: 'cancelled' },
      reason,
    });

    return updated;
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
          status: 'approved',
          createdBy: userId,
          approvedBy: userId,
          approvedAt: new Date(),
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
              status: 'approved',
              transactionType: { in: ['import', 'export', 'disposal', 'stocktake'] as any },
              createdAt: { lt: start },
            },
            // Transfer transactions (from this warehouse)
            {
              sourceWarehouseId: warehouseId,
              status: 'approved',
              transactionType: 'transfer' as any,
              createdAt: { lt: start },
            },
            // Transfer transactions (to this warehouse)
            {
              destinationWarehouseId: warehouseId,
              status: 'approved',
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
              status: 'approved',
              transactionType: { in: ['import', 'export', 'disposal', 'stocktake'] as any },
              createdAt: {
                gte: start,
                lte: end,
              },
            },
            // Transfer transactions (from this warehouse)
            {
              sourceWarehouseId: warehouseId,
              status: 'approved',
              transactionType: 'transfer' as any,
              createdAt: {
                gte: start,
                lte: end,
              },
            },
            // Transfer transactions (to this warehouse)
            {
              destinationWarehouseId: warehouseId,
              status: 'approved',
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
}

export default new StockTransactionService();
