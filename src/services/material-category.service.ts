import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';

const prisma = new PrismaClient();

class MaterialCategoryService {
    async getAllMaterialCategories(query: { page?: string; limit?: string; search?: string }) {
        const {
            page = '1',
            limit = '1000',
            search,
        } = query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const where: Prisma.MaterialCategoryWhereInput = {
            deletedAt: null,
            status: 'active',
            ...(search && {
                OR: [
                    { categoryName: { contains: search } },
                    { categoryCode: { contains: search } },
                ],
            }),
        };

        const [categories, total] = await Promise.all([
            prisma.materialCategory.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { categoryName: 'asc' },
                select: {
                    id: true,
                    categoryCode: true,
                    categoryName: true,
                    parentId: true,
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
                            children: { where: { deletedAt: null } },
                            materials: { where: { deletedAt: null } },
                        },
                    },
                },
            }),
            prisma.materialCategory.count({ where }),
        ]);

        return {
            data: categories,
            meta: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        };
    }

    async createMaterialCategory(data: {
        categoryCode: string;
        categoryName: string;
        parentId?: number | null;
        status?: string;
    }, createdBy: number) {
        const existingCode = await prisma.materialCategory.findFirst({
            where: { categoryCode: data.categoryCode },
        });
        if (existingCode) {
            if (existingCode.deletedAt === null) {
                throw new ConflictError('Mã danh mục đã tồn tại');
            } else {
                await prisma.materialCategory.update({
                    where: { id: existingCode.id },
                    data: { categoryCode: `${existingCode.categoryCode}-deleted-${Date.now()}` },
                });
            }
        }

        if (data.parentId) {
            const parentExists = await prisma.materialCategory.findUnique({
                where: { id: data.parentId },
            });
            if (!parentExists) {
                throw new NotFoundError('Danh mục cha không tồn tại');
            }
        }

        const category = await prisma.materialCategory.create({
            data: {
                categoryCode: data.categoryCode,
                categoryName: data.categoryName,
                parentId: data.parentId || null,
                status: (data.status as any) || 'active',
            },
            select: {
                id: true,
                categoryCode: true,
                categoryName: true,
                parentId: true,
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

        logActivity('create', createdBy, 'material_categories', {
            recordId: category.id,
            newValue: category,
        });

        return category;
    }
}

export default new MaterialCategoryService();
