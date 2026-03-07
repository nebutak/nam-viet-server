import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
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

  async importCategories(buffer: Buffer, userId: number) {
    const xlsx = require('xlsx');
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = xlsx.utils.sheet_to_json(worksheet);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const [index, row] of data.entries()) {
      try {
        const rowNum = index + 2; // +1 for 0-index, +1 for header
        const categoryCode = row['Mã danh mục'];
        const categoryName = row['Tên danh mục'];
        const slug = row['Đường dẫn'];
        const description = row['Mô tả'];
        const statusText = row['Trạng thái'];
        const parentName = row['Danh mục cha'];

        if (!categoryCode || !categoryName || !slug) {
          errors.push(`Dòng ${rowNum}: Thiếu trường bắt buộc (Mã, Tên hoặc Đường dẫn)`);
          errorCount++;
          continue;
        }

        const existingCode = await prisma.category.findFirst({
          where: { categoryCode }
        });
        if (existingCode) {
          if (existingCode.deletedAt === null) {
            errors.push(`Dòng ${rowNum}: Mã danh mục ${categoryCode} đã tồn tại`);
            errorCount++;
            continue;
          } else {
            // Rename to free code
            await prisma.category.update({
              where: { id: existingCode.id },
              data: { categoryCode: `${existingCode.categoryCode}-deleted-${Date.now()}` }
            });
          }
        }

        const existingSlug = await prisma.category.findFirst({
          where: { slug }
        });
        if (existingSlug) {
          if (existingSlug.deletedAt === null) {
            errors.push(`Dòng ${rowNum}: Đường dẫn ${slug} đã tồn tại`);
            errorCount++;
            continue;
          } else {
            // Rename to free slug
            await prisma.category.update({
              where: { id: existingSlug.id },
              data: { slug: `${existingSlug.slug}-deleted-${Date.now()}` }
            });
          }
        }

        let parentId = null;
        if (parentName) {
          const parent = await prisma.category.findFirst({
            where: { categoryName: parentName, deletedAt: null }
          });
          if (parent) {
            parentId = parent.id;
          } else {
            errors.push(`Dòng ${rowNum}: Không tìm thấy danh mục cha '${parentName}'`);
          }
        }

        const status = (statusText === 'Ngừng hoạt động' || statusText === 'inactive') ? 'inactive' : 'active';

        await prisma.category.create({
          data: {
            categoryCode,
            categoryName,
            slug,
            description: description || null,
            parentId,
            status
          }
        });
        successCount++;
      } catch (err: any) {
        errors.push(`Dòng ${index + 2}: Lỗi hệ thống - ${err.message}`);
        errorCount++;
      }
    }

    logActivity('import', userId, 'categories', {
      successCount,
      errorCount
    });

    return {
      successCount,
      errorCount,
      errors
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
