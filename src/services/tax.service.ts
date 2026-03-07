import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import { TaxQueryInput, CreateTaxInput, UpdateTaxInput } from '@validators/tax.validator';

const prisma = new PrismaClient();

class TaxService {
    async getAll(query: TaxQueryInput) {
        const {
            page = '1',
            limit = '20',
            search,
            status,
        } = query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const offset = (pageNum - 1) * limitNum;

        const where: Prisma.TaxWhereInput = {
            deletedAt: null,
            ...(status && { status }),
            ...(search && {
                title: { contains: search },
            }),
        };

        const [taxes, total] = await Promise.all([
            prisma.tax.findMany({
                where,
                include: {
                    creator: { select: { id: true, fullName: true } },
                },
                skip: offset,
                take: limitNum,
                orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
            }),
            prisma.tax.count({ where }),
        ]);

        return {
            data: taxes,
            meta: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        };
    }

    async getById(id: number) {
        const tax = await prisma.tax.findUnique({
            where: { id },
            include: {
                creator: { select: { id: true, fullName: true } },
                updater: { select: { id: true, fullName: true } },
            },
        });

        if (!tax) throw new NotFoundError('Không tìm thấy thuế');
        return tax;
    }

    async create(data: CreateTaxInput, userId: number) {
        const tax = await prisma.tax.create({
            data: {
                title: data.title,
                percentage: data.percentage,
                priority: data.priority ?? 0,
                status: data.status ?? 'active',
                createdBy: userId,
            },
        });

        logActivity('create', userId, 'taxes', { recordId: tax.id, title: tax.title });
        return tax;
    }

    async update(id: number, data: UpdateTaxInput, userId: number) {
        await this.getById(id);

        const updated = await prisma.tax.update({
            where: { id },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.percentage !== undefined && { percentage: data.percentage }),
                ...(data.priority !== undefined && { priority: data.priority }),
                ...(data.status !== undefined && { status: data.status }),
                updatedBy: userId,
            },
        });

        logActivity('update', userId, 'taxes', { recordId: id, changes: data });
        return updated;
    }

    async delete(id: number, userId: number) {
        await this.getById(id);

        await prisma.tax.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        logActivity('delete', userId, 'taxes', { recordId: id });
        return { message: 'Xóa thuế thành công' };
    }

    async bulkDelete(ids: number[], userId: number) {
        await prisma.tax.updateMany({
            where: { id: { in: ids } },
            data: { deletedAt: new Date() },
        });

        logActivity('delete', userId, 'taxes', { action: 'bulk_delete', recordIds: ids });
        return { message: `Xóa thành công ${ids.length} thuế` };
    }
}

export default new TaxService();
