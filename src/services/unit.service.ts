import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import {
    UnitQueryInput,
    CreateUnitInput,
    UpdateUnitInput,
    UpdateUnitStatusInput,
} from '@validators/unit.validator';

const prisma = new PrismaClient();

class UnitService {
    async getAll(query: UnitQueryInput) {
        const {
            page = '1',
            limit = '20',
            search,
            status,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const offset = (pageNum - 1) * limitNum;

        const where: Prisma.UnitWhereInput = {
            deletedAt: null,
            ...(status && { status }),
            ...(search && {
                OR: [
                    { unitCode: { contains: search } },
                    { unitName: { contains: search } },
                ],
            }),
        };

        const [units, total] = await Promise.all([
            prisma.unit.findMany({
                where,
                include: {
                    creator: {
                        select: { id: true, fullName: true, employeeCode: true },
                    },
                },
                skip: offset,
                take: limitNum,
                orderBy: { [sortBy]: sortOrder },
            }),
            prisma.unit.count({ where }),
        ]);

        return {
            data: units,
            meta: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        };
    }

    async getById(id: number) {
        const unit = await prisma.unit.findUnique({
            where: { id },
            include: {
                creator: { select: { id: true, fullName: true, employeeCode: true } },
                updater: { select: { id: true, fullName: true, employeeCode: true } },
            },
        });

        if (!unit) {
            throw new NotFoundError('Không tìm thấy đơn vị tính');
        }

        return unit;
    }

    async create(data: CreateUnitInput, userId: number) {
        const existingUnit = await prisma.unit.findUnique({
            where: { unitCode: data.unitCode },
        });

        if (existingUnit) {
            throw new ConflictError('Mã đơn vị tính đã tồn tại');
        }

        // Check name globally but optionally? Let's assume unique name is nice but not strictly required by db constraint
        // But typically unit names are unique. I will not enforce unless business logic says so, wait, code is unique.

        const unit = await prisma.unit.create({
            data: {
                unitCode: data.unitCode,
                unitName: data.unitName,
                description: data.description || null,
                status: data.status || 'active',
                createdBy: userId,
            },
            include: {
                creator: {
                    select: { id: true, fullName: true, employeeCode: true },
                },
            }
        });

        logActivity('create', userId, 'units', {
            recordId: unit.id,
            unitCode: unit.unitCode,
        });

        return unit;
    }

    async update(id: number, data: UpdateUnitInput, userId: number) {
        const unit = await prisma.unit.findUnique({ where: { id } });

        if (!unit) {
            throw new NotFoundError('Không tìm thấy đơn vị tính');
        }

        if (data.unitCode && data.unitCode !== unit.unitCode) {
            const existingUnit = await prisma.unit.findFirst({
                where: { unitCode: data.unitCode, id: { not: id } },
            });
            if (existingUnit) {
                throw new ConflictError('Mã đơn vị tính đã tồn tại');
            }
        }

        const updatedUnit = await prisma.unit.update({
            where: { id },
            data: {
                ...(data.unitCode !== undefined && { unitCode: data.unitCode }),
                ...(data.unitName !== undefined && { unitName: data.unitName }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.status !== undefined && { status: data.status }),
                updatedBy: userId,
            },
            include: {
                creator: { select: { id: true, fullName: true, employeeCode: true } },
                updater: { select: { id: true, fullName: true, employeeCode: true } },
            }
        });

        logActivity('update', userId, 'units', {
            recordId: id,
            unitCode: unit.unitCode,
            changes: data,
        });

        return updatedUnit;
    }

    async updateStatus(id: number, data: UpdateUnitStatusInput, userId: number) {
        const unit = await prisma.unit.findUnique({ where: { id } });

        if (!unit) {
            throw new NotFoundError('Không tìm thấy đơn vị tính');
        }

        const updatedUnit = await prisma.unit.update({
            where: { id },
            data: {
                status: data.status,
                updatedBy: userId,
            },
            include: {
                creator: { select: { id: true, fullName: true, employeeCode: true } },
                updater: { select: { id: true, fullName: true, employeeCode: true } },
            }
        });

        logActivity('update', userId, 'units', {
            recordId: id,
            action: 'update_status',
            oldValue: { status: unit.status },
            newValue: { status: data.status },
        });

        return updatedUnit;
    }

    async delete(id: number, userId: number) {
        const unit = await prisma.unit.findUnique({ where: { id } });

        if (!unit) {
            throw new NotFoundError('Không tìm thấy đơn vị tính');
        }

        await prisma.unit.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        logActivity('delete', userId, 'units', {
            recordId: id,
            unitCode: unit.unitCode,
        });

        return { message: 'Xóa đơn vị tính thành công' };
    }

    async bulkDelete(ids: number[], userId: number) {
        const units = await prisma.unit.findMany({
            where: { id: { in: ids } },
        });

        if (units.length === 0) {
            throw new NotFoundError('Không tìm thấy đơn vị tính nào để xóa');
        }

        await prisma.unit.updateMany({
            where: { id: { in: ids } },
            data: { deletedAt: new Date() },
        });

        logActivity('delete', userId, 'units', {
            action: 'bulk_delete',
            recordIds: ids,
        });

        return { message: `Xóa thành công ${units.length} đơn vị tính` };
    }
}

export default new UnitService();
