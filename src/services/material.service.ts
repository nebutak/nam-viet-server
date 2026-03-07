import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import type {
    CreateMaterialInput,
    UpdateMaterialInput,
    QueryMaterialsInput,
} from '@validators/material.validator';

const prisma = new PrismaClient();

class MaterialService {
    async getAllMaterials(query: QueryMaterialsInput) {
        const {
            page = '1',
            limit = '20',
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const where: Prisma.MaterialWhereInput = {
            deletedAt: null,
            ...(search && {
                OR: [
                    { name: { contains: search } },
                    { materialCode: { contains: search } },
                ],
            }),
        };

        const [materials, total] = await Promise.all([
            prisma.material.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { [sortBy]: sortOrder },
                select: {
                    id: true,
                    materialCode: true,
                    name: true,
                    cost: true,
                    priority: true,
                    supplierId: true,
                    categoryId: true,
                    unit: true,
                    materialType: true,
                    purchaseDate: true,
                    effectiveDate: true,
                    imageUrl: true,
                    createdAt: true,
                    updatedAt: true,
                    supplier: {
                        select: {
                            id: true,
                            supplierCode: true,
                            supplierName: true,
                        },
                    },
                    category: {
                        select: {
                            id: true,
                            categoryCode: true,
                            categoryName: true,
                        },
                    },
                    _count: {
                        select: {
                            products: true,
                        },
                    },
                },
            }),
            prisma.material.count({ where }),
        ]);

        return {
            data: materials,
            meta: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        };
    }

    async getMaterialById(id: number) {
        const material = await prisma.material.findUnique({
            where: { id, deletedAt: null },
            select: {
                id: true,
                materialCode: true,
                name: true,
                cost: true,
                priority: true,
                supplierId: true,
                categoryId: true,
                unit: true,
                materialType: true,
                purchaseDate: true,
                effectiveDate: true,
                imageUrl: true,
                createdAt: true,
                updatedAt: true,
                supplier: {
                    select: {
                        id: true,
                        supplierCode: true,
                        supplierName: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        categoryCode: true,
                        categoryName: true,
                    },
                },
                products: {
                    select: {
                        product: {
                            select: {
                                id: true,
                                sku: true,
                                productName: true,
                            },
                        },
                    },
                },
            },
        });

        if (!material) {
            throw new NotFoundError('Nguyên liệu không tồn tại');
        }

        return material;
    }

    async createMaterial(data: CreateMaterialInput, createdBy: number) {
        // Check duplicate materialCode
        const codeExists = await prisma.material.findFirst({
            where: { materialCode: data.materialCode, deletedAt: null },
        });
        if (codeExists) {
            throw new ConflictError('Mã nguyên liệu đã tồn tại');
        }

        if (data.supplierId) {
            const supplier = await prisma.supplier.findUnique({
                where: { id: data.supplierId, deletedAt: null },
            });
            if (!supplier) {
                throw new ValidationError('Nhà cung cấp không tồn tại');
            }
        }

        if (data.categoryId) {
            const category = await prisma.category.findUnique({
                where: { id: data.categoryId, deletedAt: null },
            });
            if (!category) {
                throw new ValidationError('Danh mục không tồn tại');
            }
        }

        const material = await prisma.material.create({
            data: {
                materialCode: data.materialCode,
                name: data.name,
                cost: data.cost,
                supplierId: data.supplierId || null,
                categoryId: data.categoryId || null,
                unit: data.unit || null,
                materialType: data.materialType || null,
                priority: data.priority ?? 0,
                purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
                effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
                imageUrl: data.imageUrl || null,
            },
            select: {
                id: true,
                materialCode: true,
                name: true,
                cost: true,
                priority: true,
                supplierId: true,
                categoryId: true,
                unit: true,
                materialType: true,
                purchaseDate: true,
                effectiveDate: true,
                imageUrl: true,
                createdAt: true,
                supplier: {
                    select: {
                        id: true,
                        supplierCode: true,
                        supplierName: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        categoryCode: true,
                        categoryName: true,
                    },
                },
            },
        });

        logActivity('create', createdBy, 'materials', {
            recordId: material.id,
            newValue: material,
        });

        return material;
    }

    async updateMaterial(id: number, data: UpdateMaterialInput, updatedBy: number) {
        const existing = await prisma.material.findUnique({
            where: { id, deletedAt: null },
        });

        if (!existing) {
            throw new NotFoundError('Nguyên liệu không tồn tại');
        }

        if (data.materialCode && data.materialCode !== existing.materialCode) {
            const codeExists = await prisma.material.findFirst({
                where: { materialCode: data.materialCode, deletedAt: null, id: { not: id } },
            });
            if (codeExists) {
                throw new ConflictError('Mã nguyên liệu đã tồn tại');
            }
        }

        if (data.supplierId) {
            const supplier = await prisma.supplier.findUnique({
                where: { id: data.supplierId, deletedAt: null },
            });
            if (!supplier) {
                throw new ValidationError('Nhà cung cấp không tồn tại');
            }
        }

        if (data.categoryId) {
            const category = await prisma.category.findUnique({
                where: { id: data.categoryId, deletedAt: null },
            });
            if (!category) {
                throw new ValidationError('Danh mục không tồn tại');
            }
        }

        const updated = await prisma.material.update({
            where: { id },
            data: {
                ...(data.materialCode !== undefined && { materialCode: data.materialCode }),
                ...(data.name !== undefined && { name: data.name }),
                ...(data.cost !== undefined && { cost: data.cost }),
                ...(data.supplierId !== undefined && { supplierId: data.supplierId }),
                ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
                ...(data.unit !== undefined && { unit: data.unit }),
                ...(data.materialType !== undefined && { materialType: data.materialType }),
                ...(data.priority !== undefined && { priority: data.priority }),
                ...(data.purchaseDate !== undefined && { purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null }),
                ...(data.effectiveDate !== undefined && { effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null }),
                ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
            },
            select: {
                id: true,
                materialCode: true,
                name: true,
                cost: true,
                priority: true,
                supplierId: true,
                categoryId: true,
                unit: true,
                materialType: true,
                purchaseDate: true,
                effectiveDate: true,
                imageUrl: true,
                updatedAt: true,
                supplier: {
                    select: {
                        id: true,
                        supplierCode: true,
                        supplierName: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        categoryCode: true,
                        categoryName: true,
                    },
                },
            },
        });

        logActivity('update', updatedBy, 'materials', {
            recordId: id,
            oldValue: existing,
            newValue: updated,
        });

        return updated;
    }

    async deleteMaterial(id: number, deletedBy: number) {
        const material = await prisma.material.findUnique({
            where: { id, deletedAt: null },
            include: {
                _count: {
                    select: { products: true },
                },
            },
        });

        if (!material) {
            throw new NotFoundError('Nguyên liệu không tồn tại');
        }

        if (material._count.products > 0) {
            throw new ValidationError('Không thể xóa nguyên liệu đang được liên kết với sản phẩm');
        }

        await prisma.material.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        logActivity('delete', deletedBy, 'materials', {
            recordId: id,
            oldValue: material,
        });

        return { message: 'Xóa nguyên liệu thành công' };
    }

    async deleteMultipleMaterials(ids: number[], deletedBy: number) {
        const materials = await prisma.material.findMany({
            where: { id: { in: ids }, deletedAt: null },
            include: {
                _count: {
                    select: { products: true },
                },
            },
        });

        if (materials.length === 0) {
            throw new NotFoundError('Không tìm thấy nguyên liệu nào để xóa');
        }

        const linkedMaterials = materials.filter((m) => m._count.products > 0);
        if (linkedMaterials.length > 0) {
            const names = linkedMaterials.map((m) => m.name).join(', ');
            throw new ValidationError(
                `Không thể xóa các nguyên liệu đang liên kết với sản phẩm: ${names}`
            );
        }

        await prisma.material.updateMany({
            where: { id: { in: ids }, deletedAt: null },
            data: { deletedAt: new Date() },
        });

        logActivity('delete', deletedBy, 'materials', {
            recordId: ids,
            oldValue: materials,
        });

        return { message: `Xóa ${materials.length} nguyên liệu thành công` };
    }
}

export default new MaterialService();
