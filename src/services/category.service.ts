import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import ExcelJS from 'exceljs';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  QueryCategoriesInput,
  UpdateCategoryStatusInput,
  BulkDeleteCategoryInput,
} from '@validators/category.validator';

const prisma = new PrismaClient();

class CategoryService {
  async getAllCategories(query: QueryCategoriesInput) {
    const {
      page = '1',
      limit = '20',
      search,
      parentId,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.CategoryWhereInput = {
      ...(search && {
        OR: [
          { categoryName: { contains: search } },
          { categoryCode: { contains: search } },
          { description: { contains: search } },
        ],
      }),
      // Handle parentId filter:
      // - If parentId is provided and is 'null' string → filter root categories (parentId: null)
      // - If parentId is a number string → filter by that parent
      // - If parentId is undefined → no filter (show all)
      ...(parentId !== undefined && {
        parentId: parentId === 'null' ? null : parseInt(parentId),
      }),
      ...(status && { status }),
      deletedAt: null, // Exclude soft-deleted items
    };

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          categoryCode: true,
          categoryName: true,
          slug: true,
          parentId: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          parent: {
            select: {
              id: true,
              categoryCode: true,
              categoryName: true,
            },
          },
          _count: {
            select: {
              children: {
                where: { deletedAt: null },
              },
              products: true,
            },
          },
        },
      }),
      prisma.category.count({ where }),
    ]);

    const result = {
      data: categories,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      message: 'Lấy danh sách danh mục thành công',
    };

    return result;
  }

  async getCategoryTree() {

    const categories = await prisma.category.findMany({
      where: { status: 'active', deletedAt: null },
      select: {
        id: true,
        categoryCode: true,
        categoryName: true,
        slug: true,
        parentId: true,
        description: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: { categoryName: 'asc' },
    });

    const tree = this.buildTree(categories, null);

    return tree;
  }

  private buildTree(categories: any[], parentId: number | null): any[] {
    return categories
      .filter((cat) => cat.parentId === parentId)
      .map((cat) => ({
        ...cat,
        children: this.buildTree(categories, cat.id),
      }));
  }

  async getCategoryById(id: number) {

    const category = await prisma.category.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        categoryCode: true,
        categoryName: true,
        slug: true,
        parentId: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        parent: {
          select: {
            id: true,
            categoryCode: true,
            categoryName: true,
            slug: true,
          },
        },
        children: {
          where: { deletedAt: null },
          select: {
            id: true,
            categoryCode: true,
            categoryName: true,
            slug: true,
            status: true,
            _count: {
              select: {
                products: true,
              },
            },
          },
        },
        _count: {
          select: {
            children: {
              where: { deletedAt: null },
            },
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundError('Danh mục không tồn tại');
    }

    return category;
  }

  async createCategory(data: CreateCategoryInput, createdBy: number) {
    const existingCode = await prisma.category.findFirst({
      where: { categoryCode: data.categoryCode }
    });
    if (existingCode) {
      if (existingCode.deletedAt === null) {
        throw new ConflictError('Mã danh mục đã tồn tại');
      } else {
        // Soft-deleted category exists with this code, rename it to free up the code
        await prisma.category.update({
          where: { id: existingCode.id },
          data: { categoryCode: `${existingCode.categoryCode}-deleted-${Date.now()}` }
        });
      }
    }

    const existingSlug = await prisma.category.findFirst({
      where: { slug: data.slug }
    });
    if (existingSlug) {
      if (existingSlug.deletedAt === null) {
        throw new ConflictError('Slug đã tồn tại');
      } else {
        // Soft-deleted category exists with this slug, rename it to free up the slug
        await prisma.category.update({
          where: { id: existingSlug.id },
          data: { slug: `${existingSlug.slug}-deleted-${Date.now()}` }
        });
      }
    }

    if (data.parentId) {
      const parentExists = await prisma.category.findUnique({
        where: { id: data.parentId },
      });
      if (!parentExists) {
        throw new NotFoundError('Danh mục cha không tồn tại');
      }
    }

    const category = await prisma.category.create({
      data: {
        categoryCode: data.categoryCode,
        categoryName: data.categoryName,
        slug: data.slug,
        parentId: data.parentId || null,
        description: data.description || null,
        status: data.status || 'active',
      },
      select: {
        id: true,
        categoryCode: true,
        categoryName: true,
        slug: true,
        parentId: true,
        description: true,
        status: true,
        createdAt: true,
        parent: {
          select: {
            id: true,
            categoryCode: true,
            categoryName: true,
          },
        },
      },
    });

    logActivity('create', createdBy, 'categories', {
      recordId: category.id,
      newValue: category,
    });

    return category;
  }

  async updateCategory(id: number, data: UpdateCategoryInput, updatedBy: number) {
    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new NotFoundError('Danh mục không tồn tại');
    }

    if (data.categoryCode && data.categoryCode !== existingCategory.categoryCode) {
      const existingCode = await prisma.category.findFirst({
        where: { categoryCode: data.categoryCode, id: { not: id } }
      });
      if (existingCode) {
        if (existingCode.deletedAt === null) {
          throw new ConflictError('Mã danh mục đã tồn tại');
        } else {
          // Soft-deleted category exists with this code, rename it to free up the code
          await prisma.category.update({
            where: { id: existingCode.id },
            data: { categoryCode: `${existingCode.categoryCode}-deleted-${Date.now()}` }
          });
        }
      }
    }

    if (data.slug && data.slug !== existingCategory.slug) {
      const existingSlug = await prisma.category.findFirst({
        where: { slug: data.slug, id: { not: id } }
      });
      if (existingSlug) {
        if (existingSlug.deletedAt === null) {
          throw new ConflictError('Slug đã tồn tại');
        } else {
          // Soft-deleted category exists with this slug, rename it to free up the slug
          await prisma.category.update({
            where: { id: existingSlug.id },
            data: { slug: `${existingSlug.slug}-deleted-${Date.now()}` }
          });
        }
      }
    }

    if (data.parentId !== undefined) {
      if (data.parentId === id) {
        throw new ValidationError('Danh mục không thể là danh mục cha của chính nó');
      }

      if (data.parentId !== null) {
        const parentExists = await prisma.category.findUnique({
          where: { id: data.parentId },
        });
        if (!parentExists) {
          throw new NotFoundError('Danh mục cha không tồn tại');
        }

        const isCircular = await this.checkCircularReference(id, data.parentId);
        if (isCircular) {
          throw new ValidationError('Phát hiện tham chiếu vòng. Không thể đặt danh mục cha.');
        }
      }
    }

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: {
        ...(data.categoryCode && { categoryCode: data.categoryCode }),
        ...(data.categoryName && { categoryName: data.categoryName }),
        ...(data.slug && { slug: data.slug }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status && { status: data.status }),
      },
      select: {
        id: true,
        categoryCode: true,
        categoryName: true,
        slug: true,
        parentId: true,
        description: true,
        status: true,
        updatedAt: true,
        parent: {
          select: {
            id: true,
            categoryCode: true,
            categoryName: true,
          },
        },
      },
    });

    logActivity('update', updatedBy, 'categories', {
      recordId: id,
      oldValue: existingCategory,
      newValue: updatedCategory,
    });

    return updatedCategory;
  }

  async deleteCategory(id: number, deletedBy: number) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            children: {
              where: { deletedAt: null },
            },
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundError('Danh mục không tồn tại');
    }

    if (category._count.children > 0) {
      throw new ValidationError('Không thể xóa danh mục có danh mục con');
    }

    if (category._count.products > 0) {
      throw new ValidationError('Không thể xóa danh mục có sản phẩm');
    }

    // soft delete
    await prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    logActivity('delete', deletedBy, 'categories', {
      recordId: id,
      oldValue: category,
    });

    return { message: 'Xóa danh mục thành công', data: { id } };
  }

  async updateStatus(id: number, data: UpdateCategoryStatusInput, updatedBy: number) {
    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundError('Danh mục không tồn tại');
    }

    if (category.status === data.status) {
      return category;
    }

    // If setting to inactive, maybe we should check if it has active products or children?
    // Depending on business logic, for now, we just update it.
    const updatedCategory = await prisma.category.update({
      where: { id },
      data: {
        status: data.status,
      },
    });

    logActivity('update', updatedBy, 'categories', {
      recordId: id,
      action: 'update_status',
      oldValue: { status: category.status },
      newValue: { status: data.status },
    });

    return updatedCategory;
  }

  async bulkDelete(data: BulkDeleteCategoryInput, deletedBy: number) {
    const { ids } = data;

    // Check if any of the categories have children or products
    const categoriesWithRelations = await prisma.category.findMany({
      where: { id: { in: ids } },
      include: {
        _count: {
          select: {
            children: {
              where: { deletedAt: null },
            },
            products: true,
          },
        },
      },
    });

    const categoryNamesCannotBeDeleted: string[] = [];
    const idsToDelete: number[] = [];

    for (const cat of categoriesWithRelations) {
      if (cat._count.children > 0 || cat._count.products > 0) {
        categoryNamesCannotBeDeleted.push(cat.categoryName);
      } else {
        idsToDelete.push(cat.id);
      }
    }

    if (categoryNamesCannotBeDeleted.length > 0) {
      throw new ValidationError(
        `Không thể xóa các danh mục sau vì đang có sản phẩm hoặc danh mục con: ${categoryNamesCannotBeDeleted.join(', ')}`
      );
    }

    if (idsToDelete.length === 0) {
      throw new ValidationError('Không có danh mục nào hợp lệ để xóa');
    }

    // Soft delete
    await prisma.category.updateMany({
      where: { id: { in: idsToDelete } },
      data: {
        deletedAt: new Date(),
      },
    });

    logActivity('bulk_delete', deletedBy, 'categories', {
      recordIds: idsToDelete,
    });

    return { message: `Đã xóa thành công ${idsToDelete.length} danh mục` };
  }

  async checkCategoryCodeExists(code: string, excludeId?: number): Promise<boolean> {
    const category = await prisma.category.findFirst({
      where: {
        categoryCode: code,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    return !!category;
  }

  async checkSlugExists(slug: string, excludeId?: number): Promise<boolean> {
    const category = await prisma.category.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    return !!category;
  }

  async exportCategories() {
    // We'll import dynamically to avoid loading it if not used immediately,
    // though static import is also fine. Let's just use static or require.
    const xlsx = require('xlsx');

    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        parent: { select: { categoryName: true } },
      }
    });

    const data = categories.map((cat) => ({
      'Mã danh mục': cat.categoryCode,
      'Tên danh mục': cat.categoryName,
      'Đường dẫn': cat.slug,
      'Danh mục cha': cat.parent?.categoryName || '',
      'Mô tả': cat.description || '',
      'Trạng thái': cat.status === 'active' ? 'Hoạt động' : 'Ngừng hoạt động',
      'Ngày tạo': cat.createdAt.toISOString(),
    }));

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Categories');

    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async downloadImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Nhập liệu Danh mục');

    worksheet.mergeCells('A1:E1');
    worksheet.getCell('A1').value = 'HƯỚNG DẪN NHẬP LIỆU DANH MỤC';
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

    const instructions = [
      '1. Các cột có dấu (*) là bắt buộc nhập',
      '2. Mã danh mục và Đường dẫn phải là duy nhất.',
      '3. Trạng thái chỉ điền "Hoạt động" hoặc "Ngừng"',
      '4. Danh mục cha phải nhập đúng Tên danh mục đã tồn tại trong hệ thống (để trống nếu là danh mục root)'
    ];

    instructions.forEach((instruction, idx) => {
      worksheet.getCell(`A${idx + 2}`).value = instruction;
    });

    worksheet.getRow(7).values = [
      'STT',
      'Tên danh mục (*)',
      'Mã danh mục (*)',
      'Đường dẫn (*)',
      'Danh mục cha',
      'Mô tả',
      'Trạng thái (*)'
    ];

    worksheet.getRow(7).font = { bold: true };
    worksheet.getRow(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    worksheet.columns = [
      { width: 10 },
      { width: 30 },
      { width: 20 },
      { width: 25 },
      { width: 30 },
      { width: 40 },
      { width: 20 },
    ];

    return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
  }

  async importCategories(items: any[], userId: number): Promise<any> {
    if (!items || items.length === 0) {
      throw new ValidationError('Không tìm thấy dữ liệu hợp lệ để import');
    }

    const validCategories: any[] = [];
    const errors: any[] = [];
    const parentNameMap = new Map<string, number>();

    for (const [index, item] of items.entries()) {
      const rowNumber = index + 8; // Headers at row 7

      const categoryName = item.categoryName?.toString().trim();
      const categoryCode = item.categoryCode?.toString().trim();
      const slug = item.slug?.toString().trim();
      const parentNameRow = item.parentName?.toString().trim() || null;
      const description = item.description?.toString().trim() || null;
      const statusRaw = item.status?.toString().trim().toLowerCase();

      if (!categoryName) {
        errors.push({ row: rowNumber, message: 'Thiếu Tên danh mục (*)' });
        continue;
      }
      if (!categoryCode) {
        errors.push({ row: rowNumber, message: 'Thiếu Mã danh mục (*)' });
        continue;
      }
      if (!slug) {
        errors.push({ row: rowNumber, message: 'Thiếu Đường dẫn (*)' });
        continue;
      }

      let status = 'active';
      if (statusRaw === 'ngừng' || statusRaw === 'ngung' || statusRaw === 'inactive' || statusRaw === 'ngừng hoạt động') {
        status = 'inactive';
      } else if (!statusRaw && item.status !== undefined) {
        errors.push({ row: rowNumber, message: 'Trạng thái không được bỏ trống' });
        continue;
      }

      let parentId: number | null = null;

      if (parentNameRow) {
        if (!parentNameMap.has(parentNameRow)) {
          const parent = await prisma.category.findFirst({
            where: { categoryName: parentNameRow, deletedAt: null }
          });
          if (parent) {
            parentNameMap.set(parentNameRow, parent.id);
            parentId = parent.id;
          } else {
            errors.push({ row: rowNumber, message: `Không tìm thấy danh mục cha '${parentNameRow}'` });
            continue;
          }
        } else {
            parentId = parentNameMap.get(parentNameRow) || null;
        }
      }

      validCategories.push({
        categoryName,
        categoryCode,
        slug,
        parentId,
        description,
        status,
        rowNumber
      });
    }

    if (validCategories.length === 0) {
      throw new ValidationError('Không tìm thấy dữ liệu hợp lệ để import (có thể bị lỗi format)');
    }

    // Check duplicates in file
    const codeSet = new Set();
    const slugSet = new Set();
    
    validCategories.forEach(cat => {
      if (codeSet.has(cat.categoryCode)) {
        errors.push({ row: cat.rowNumber, message: `Mã danh mục ${cat.categoryCode} bị trùng trong file` });
      } else {
        codeSet.add(cat.categoryCode);
      }

      if (slugSet.has(cat.slug)) {
        errors.push({ row: cat.rowNumber, message: `Đường dẫn ${cat.slug} bị trùng trong file` });
      } else {
        slugSet.add(cat.slug);
      }
    });

    if (errors.length > 0) {
       throw { importErrors: errors };
    }

    // Check DB existing codes
    const existingCategories = await prisma.category.findMany({
        where: {
            OR: [
                { categoryCode: { in: validCategories.map(c => c.categoryCode) } },
                { slug: { in: validCategories.map(c => c.slug) } }
            ]
        },
        select: { categoryCode: true, slug: true, deletedAt: true, id: true }
    });

    for (const cat of validCategories) {
        const matches = existingCategories.filter(e => e.categoryCode === cat.categoryCode || e.slug === cat.slug);
        for(let match of matches) {
            if(match.deletedAt === null) {
                if(match.categoryCode === cat.categoryCode) {
                     errors.push({ row: cat.rowNumber, message: `Mã danh mục ${cat.categoryCode} đã tồn tại trong hệ thống` });
                }
                if(match.slug === cat.slug) {
                     errors.push({ row: cat.rowNumber, message: `Đường dẫn ${cat.slug} đã tồn tại trong hệ thống` });
                }
            } else {
               // Hard delete or rename soft deleted item to free up space
               await prisma.category.update({
                  where: { id: match.id },
                  data: {
                      categoryCode: `${match.categoryCode}-deleted-${Date.now()}`,
                      slug: `${match.slug}-deleted-${Date.now()}`
                  }
               });
            }
        }
    }

    if (errors.length > 0) {
      throw { importErrors: errors };
    }

    const { count } = await prisma.category.createMany({
      data: validCategories.map(c => ({
          categoryName: c.categoryName,
          categoryCode: c.categoryCode,
          slug: c.slug,
          parentId: c.parentId,
          description: c.description,
          status: c.status,
      })),
      skipDuplicates: true,
    });

    logActivity('import', userId, 'categories', {
      action: 'import_categories',
      importedCount: count,
    });

    return {
      importedCount: count,
      totalProcessed: items.length,
      errors,
    };
  }

  private async checkCircularReference(categoryId: number, newParentId: number): Promise<boolean> {
    let currentParentId: number | null = newParentId;

    while (currentParentId !== null) {
      if (currentParentId === categoryId) {
        return true;
      }

      const parent: { parentId: number | null } | null = await prisma.category.findUnique({
        where: { id: currentParentId },
        select: { parentId: true },
      });

      currentParentId = parent?.parentId || null;
    }

    return false;
  }



  async getCategoryStats() {

    // Get all categories with stats
    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        categoryName: true,
        parentId: true,
        status: true,
        _count: {
          select: {
            children: {
              where: { deletedAt: null },
            },
            products: true,
          },
        },
      },
    });

    // Calculate statistics
    const totalCategories = categories.length;
    const activeCategories = categories.filter((c) => c.status === 'active').length;
    const inactiveCategories = categories.filter((c) => c.status === 'inactive').length;
    const rootCategories = categories.filter((c) => !c.parentId).length;
    const totalProducts = categories.reduce((sum, c) => sum + c._count.products, 0);

    // Get top categories by product count
    const topCategories = categories
      .filter((c) => c._count.products > 0)
      .sort((a, b) => b._count.products - a._count.products)
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        categoryName: c.categoryName,
        productCount: c._count.products,
      }));

    const stats = {
      totalCategories,
      activeCategories,
      inactiveCategories,
      rootCategories,
      totalProducts,
      topCategories,
    };

    return stats;
  }
}

export default new CategoryService();
