import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
  QuerySuppliersInput,
} from '@validators/supplier.validator';

const prisma = new PrismaClient();

class SupplierService {
  async getAllSuppliers(query: QuerySuppliersInput) {
    const {
      page = '1',
      limit = '20',
      search,
      supplierType,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { supplierName: { contains: search } },
          { supplierCode: { contains: search } },
          { contactName: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
          { taxCode: { contains: search } },
        ],
      }),
      ...(supplierType && { supplierType }),
      ...(status && { status }),
    };

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          supplierCode: true,
          supplierName: true,
          supplierType: true,
          contactName: true,
          phone: true,
          email: true,
          address: true,
          taxCode: true,
          totalPayable: true,
          paymentTerms: true,
          notes: true,
          status: true,
          payableUpdatedAt: true,
          createdAt: true,
          updatedAt: true,
          creator: {
            select: {
              fullName: true,
            },
          },
          _count: {
            select: {
              products: true,
              purchaseOrders: true,
            },
          },
        },
      }),
      prisma.supplier.count({ where }),
    ]);

    // Stat Cards
    const totalSuppliers = total;
    const activeSuppliers = await prisma.supplier.count({
      where: {
        ...where,
        status: 'active',
      },
    });
    const totalDebt = suppliers.reduce((total, supplier) => {
      return total + Number(supplier.totalPayable);
    }, 0);

    const result = {
      data: suppliers,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      cards: {
        totalSuppliers,
        activeSuppliers,
        totalDebt,
      },
    };

    return result;
  }

  async getSupplierById(id: number) {

    const supplier = await prisma.supplier.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        supplierCode: true,
        supplierName: true,
        supplierType: true,
        contactName: true,
        phone: true,
        email: true,
        address: true,
        taxCode: true,
        totalPayable: true,
        paymentTerms: true,
        notes: true,
        status: true,
        createdBy: true,
        updatedBy: true,
        payableUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            email: true,
          },
        },
        updater: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            email: true,
          },
        },
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
            paymentVouchers: true,
            // debtReconciliations: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundError('Nhà cung cấp không tồn tại');
    }

    return supplier;
  }

  async createSupplier(data: CreateSupplierInput, createdBy: number) {
    const codeExists = await this.checkSupplierCodeExists(data.supplierCode);
    if (codeExists) {
      throw new ConflictError('Mã nhà cung cấp đã tồn tại');
    }

    if (data.taxCode) {
      const taxCodeExists = await this.checkTaxCodeExists(data.taxCode);
      if (taxCodeExists) {
        throw new ConflictError('Mã số thuế đã tồn tại');
      }
    }

    const supplier = await prisma.supplier.create({
      data: {
        supplierCode: data.supplierCode,
        supplierName: data.supplierName,
        supplierType: data.supplierType || 'local',
        contactName: data.contactName || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        taxCode: data.taxCode || null,
        paymentTerms: data.paymentTerms || null,
        notes: data.notes || null,
        status: data.status || 'active',
        createdBy,
      },
      select: {
        id: true,
        supplierCode: true,
        supplierName: true,
        supplierType: true,
        contactName: true,
        phone: true,
        email: true,
        address: true,
        taxCode: true,
        paymentTerms: true,
        notes: true,
        status: true,
        createdAt: true,
        creator: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
          },
        },
      },
    });

    logActivity('create', createdBy, 'suppliers', {
      recordId: supplier.id,
      newValue: supplier,
    });

    return supplier;
  }

  async updateSupplier(id: number, data: UpdateSupplierInput, updatedBy: number) {
    const existingSupplier = await prisma.supplier.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existingSupplier) {
      throw new NotFoundError('Nhà cung cấp không tồn tại');
    }

    if (data.supplierCode && data.supplierCode !== existingSupplier.supplierCode) {
      const codeExists = await this.checkSupplierCodeExists(data.supplierCode, id);
      if (codeExists) {
        throw new ConflictError('Mã nhà cung cấp đã tồn tại');
      }
    }

    if (data.taxCode && data.taxCode !== existingSupplier.taxCode) {
      const taxCodeExists = await this.checkTaxCodeExists(data.taxCode, id);
      if (taxCodeExists) {
        throw new ConflictError('Mã số thuế đã tồn tại');
      }
    }

    const updatedSupplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(data.supplierCode && { supplierCode: data.supplierCode }),
        ...(data.supplierName && { supplierName: data.supplierName }),
        ...(data.supplierType && { supplierType: data.supplierType }),
        ...(data.contactName !== undefined && { contactName: data.contactName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.taxCode !== undefined && { taxCode: data.taxCode }),
        ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status && { status: data.status }),
        updatedBy,
      },
      select: {
        id: true,
        supplierCode: true,
        supplierName: true,
        supplierType: true,
        contactName: true,
        phone: true,
        email: true,
        address: true,
        taxCode: true,
        paymentTerms: true,
        notes: true,
        status: true,
        updatedAt: true,
        updater: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
          },
        },
      },
    });

    logActivity('update', updatedBy, 'suppliers', {
      recordId: id,
      oldValue: existingSupplier,
      newValue: updatedSupplier,
    });

    return updatedSupplier;
  }

  async updateSupplierStatus(id: number, status: any, updatedBy: number) {
    const existingSupplier = await prisma.supplier.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existingSupplier) {
      throw new NotFoundError('Nhà cung cấp không tồn tại');
    }

    const updatedSupplier = await prisma.supplier.update({
      where: { id },
      data: {
        status,
        updatedBy,
      },
      select: {
        id: true,
        supplierCode: true,
        supplierName: true,
        status: true,
        updatedAt: true,
      }
    });

    logActivity('update', updatedBy, 'suppliers', {
      recordId: id,
      oldValue: { status: existingSupplier.status },
      newValue: { status: updatedSupplier.status },
    });

    return updatedSupplier;
  }

  async deleteSupplier(id: number, deletedBy: number) {
    const supplier = await prisma.supplier.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundError('Nhà cung cấp không tồn tại');
    }

    if (supplier._count.products > 0) {
      throw new ValidationError('Không thể xóa nhà cung cấp có sản phẩm tồn tại');
    }

    if (supplier._count.purchaseOrders > 0) {
      throw new ValidationError('Không thể xóa nhà cung cấp có đơn hàng tồn tại');
    }

    // soft delete
    await prisma.supplier.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    logActivity('delete', deletedBy, 'suppliers', {
      recordId: id,
      oldValue: supplier,
    });

    return { message: 'Xóa nhà cung cấp thành công' };
  }

  async checkSupplierCodeExists(code: string, excludeId?: number): Promise<boolean> {
    const supplier = await prisma.supplier.findFirst({
      where: {
        supplierCode: code,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    return !!supplier;
  }

  async checkTaxCodeExists(taxCode: string, excludeId?: number): Promise<boolean> {
    const supplier = await prisma.supplier.findFirst({
      where: {
        taxCode,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    return !!supplier;
  }

  async importSuppliers(items: any[], userId: number) {
    const errorItems: any[] = [];
    const operations: any[] = [];
    let currentMaxSequence = 0;

    // generate prefix NCC + yyyyMMdd
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    const prefix = `NCC${dateStr}`;

    const lastSupplier = await prisma.supplier.findFirst({
      where: { supplierCode: { startsWith: prefix } },
      orderBy: { supplierCode: 'desc' },
    });

    if (lastSupplier && lastSupplier.supplierCode) {
      const lastSequenceStr = lastSupplier.supplierCode.slice(-3);
      if (!isNaN(Number(lastSequenceStr))) {
        currentMaxSequence = parseInt(lastSequenceStr, 10);
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = i + 2;

      const phone = item.phone?.trim() || null;
      const email = item.email?.trim() || null;
      const taxCode = item.taxCode?.trim() || null;

      let existingSupplier = null;

      // Try to match existing by taxCode, then phone, then email
      if (taxCode) {
        existingSupplier = await prisma.supplier.findFirst({ where: { taxCode } });
      }
      if (!existingSupplier && phone) {
        existingSupplier = await prisma.supplier.findFirst({ where: { phone } });
        if (existingSupplier && existingSupplier.taxCode && taxCode && existingSupplier.taxCode !== taxCode) {
          errorItems.push({ row, errors: [{ field: 'Mã số thuế', message: `Số điện thoại "${phone}" đã thuộc về nhà cung cấp khác có MST: ${existingSupplier.taxCode}.` }] });
          continue;
        }
      }
      if (!existingSupplier && email) {
        existingSupplier = await prisma.supplier.findFirst({ where: { email } });
      }

      const supplierData = {
        supplierType: item.supplierType || 'local',
        supplierName: item.name.trim(),
        contactName: item.contactName?.trim() || null,
        phone,
        email,
        address: item.address?.trim() || null,
        taxCode,
        paymentTerms: item.paymentTerms?.trim() || null,
        notes: item.note?.trim() || null,
        status: item.status || 'active',
      };

      if (existingSupplier) {
        if (phone && phone !== existingSupplier.phone) {
          const phoneConflict = await prisma.supplier.findFirst({ where: { phone, id: { not: existingSupplier.id } } });
          if (phoneConflict) {
            errorItems.push({ row, errors: [{ field: 'Số điện thoại', message: 'Số điện thoại đã được sử dụng bởi nhà cung cấp khác.' }] });
            continue;
          }
        }
        if (email && email !== existingSupplier.email) {
          const emailConflict = await prisma.supplier.findFirst({ where: { email, id: { not: existingSupplier.id } } });
          if (emailConflict) {
            errorItems.push({ row, errors: [{ field: 'Email', message: 'Email đã được sử dụng bởi nhà cung cấp khác.' }] });
            continue;
          }
        }
        if (taxCode && taxCode !== existingSupplier.taxCode) {
          const taxCodeConflict = await prisma.supplier.findFirst({ where: { taxCode, id: { not: existingSupplier.id } } });
          if (taxCodeConflict) {
            errorItems.push({ row, errors: [{ field: 'Mã số thuế', message: 'Mã số thuế đã được sử dụng bởi nhà cung cấp khác.' }] });
            continue;
          }
        }
        operations.push({ type: 'update', data: { ...supplierData, updatedBy: userId }, id: existingSupplier.id, row });
      } else {
        if (phone) {
          const phoneExists = await prisma.supplier.findFirst({ where: { phone } });
          if (phoneExists) {
            errorItems.push({ row, errors: [{ field: 'Số điện thoại', message: 'Số điện thoại đã tồn tại.' }] });
            continue;
          }
        }
        if (email) {
          const emailExists = await prisma.supplier.findFirst({ where: { email } });
          if (emailExists) {
            errorItems.push({ row, errors: [{ field: 'Email', message: 'Email đã tồn tại.' }] });
            continue;
          }
        }
        if (taxCode) {
          const taxCodeExists = await prisma.supplier.findFirst({ where: { taxCode } });
          if (taxCodeExists) {
            errorItems.push({ row, errors: [{ field: 'Mã số thuế', message: 'Mã số thuế đã tồn tại.' }] });
            continue;
          }
        }

        currentMaxSequence++;
        const sequenceStr = currentMaxSequence.toString().padStart(3, '0');
        const supplierCode = `${prefix}${sequenceStr}`;

        operations.push({ type: 'create', data: { ...supplierData, supplierCode, createdBy: userId }, row });
      }
    }

    if (errorItems.length > 0) {
      throw { importErrors: errorItems };
    }

    let createdCount = 0;
    let updatedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        if (op.type === 'create') {
          const c = await tx.supplier.create({ data: op.data });
          logActivity('create', userId, 'suppliers', {
            recordId: c.id,
            supplierCode: c.supplierCode,
            isImport: true
          });
          createdCount++;
        } else {
          const u = await tx.supplier.update({ where: { id: op.id }, data: op.data });
          logActivity('update', userId, 'suppliers', {
            recordId: u.id,
            supplierCode: u.supplierCode,
            isImport: true
          });
          updatedCount++;
        }
      }
    });

    return { createdCount, updatedCount, totalProcessed: operations.length };
  }
}

export default new SupplierService();
