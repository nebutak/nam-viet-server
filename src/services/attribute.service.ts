import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import { AttributeQueryInput, CreateAttributeInput, UpdateAttributeInput } from '@validators/attribute.validator';

const prisma = new PrismaClient();

class AttributeService {
    async getAll(query: AttributeQueryInput) {
        const { page = '1', limit = '20', search, status } = query;
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const offset = (pageNum - 1) * limitNum;

        const where: Prisma.AttributeWhereInput = {
            deletedAt: null,
            ...(status && { status }),
            ...(search && { name: { contains: search } }),
        };

        const [attributes, total] = await Promise.all([
            prisma.attribute.findMany({
                where,
                include: { creator: { select: { id: true, fullName: true } } },
                skip: offset,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.attribute.count({ where }),
        ]);

        return {
            data: attributes,
            meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        };
    }

    async getById(id: number) {
        const attribute = await prisma.attribute.findUnique({ where: { id } });
        if (!attribute) throw new NotFoundError('Không tìm thấy thuộc tính');
        return attribute;
    }

    async create(data: CreateAttributeInput, userId: number) {
        const attribute = await prisma.attribute.create({
            data: {
                name: data.name,
                code: data.code || null,
                dataType: data.dataType || null,
                unit: data.unit || null,
                description: data.description || null,
                status: data.status ?? 'published',
                createdBy: userId,
            },
        });
        logActivity('create', userId, 'attributes', { recordId: attribute.id, name: attribute.name });
        return attribute;
    }

    async update(id: number, data: UpdateAttributeInput, userId: number) {
        await this.getById(id);
        const updated = await prisma.attribute.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.code !== undefined && { code: data.code }),
                ...(data.dataType !== undefined && { dataType: data.dataType }),
                ...(data.unit !== undefined && { unit: data.unit }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.status !== undefined && { status: data.status }),
                updatedBy: userId,
            },
        });
        logActivity('update', userId, 'attributes', { recordId: id, changes: data });
        return updated;
    }

    async delete(id: number, userId: number) {
        await this.getById(id);
        await prisma.attribute.update({ where: { id }, data: { deletedAt: new Date() } });
        logActivity('delete', userId, 'attributes', { recordId: id });
        return { message: 'Xóa thuộc tính thành công' };
    }

    async bulkDelete(ids: number[], userId: number) {
        await prisma.attribute.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
        logActivity('delete', userId, 'attributes', { action: 'bulk_delete', recordIds: ids });
        return { message: `Xóa thành công ${ids.length} thuộc tính` };
    }
}

export default new AttributeService();
