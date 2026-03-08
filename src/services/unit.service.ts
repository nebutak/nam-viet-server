import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ConflictError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import ExcelJS from 'exceljs';
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

    async downloadImportTemplate(): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Nhập liệu Đơn vị');

        // Instructions
        worksheet.mergeCells('A1:D1');
        worksheet.getCell('A1').value = 'HƯỚNG DẪN NHẬP LIỆU ĐƠN VỊ TÍNH';
        worksheet.getCell('A1').font = { bold: true, size: 14 };
        worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        const instructions = [
            '1. Các cột có dấu (*) là bắt buộc nhập',
            '2. Tên đơn vị và Mã đơn vị phải viết duy nhất, không trùng lặp đè lên dữ liệu cũ',
            '3. Trạng thái chỉ điền "Cho phép sử dụng" hoặc "Ngưng"'
        ];

        instructions.forEach((instruction, idx) => {
            worksheet.getCell(`A${idx + 2}`).value = instruction;
        });

        // Add headers at row 6
        worksheet.getRow(6).values = [
            'STT',
            'Tên đơn vị (*)',
            'Mã đơn vị (*)',
            'Ghi chú',
            'Trạng thái (*)'
        ];

        worksheet.getRow(6).font = { bold: true };
        worksheet.getRow(6).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Format columns
        worksheet.columns = [
            { width: 10 },  // STT
            { width: 30 },  // Tên đơn vị
            { width: 25 },  // Mã đơn vị
            { width: 30 },  // Ghi chú
            { width: 20 },  // Trạng thái
        ];

        return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
    }

    async importUnits(items: any[], userId: number): Promise<any> {
        if (!items || items.length === 0) {
            throw new ValidationError('Không tìm thấy dữ liệu hợp lệ để import');
        }

        const validUnits: any[] = [];
        const errors: any[] = [];

        items.forEach((item, index) => {
            const rowNumber = index + 6; // To match Excel rows typically
            
            const unitName = item.unitName?.toString().trim();
            const unitCode = item.unitCode?.toString().trim();
            const description = item.description?.toString().trim() || null;
            let statusRaw = item.status?.toString().trim().toLowerCase();

            if (!unitName || !unitCode) {
                if (unitName || unitCode) {
                    errors.push({ row: rowNumber, message: 'Thiếu Tên hoặc Mã đơn vị ở các trường bắt buộc (*)' });
                }
                return;
            }

            let status = 'active';
            if (statusRaw === 'ngưng' || statusRaw === 'ngung' || statusRaw === 'inactive') {
                status = 'inactive';
            } else if (!statusRaw && item.status !== undefined) {
                errors.push({ row: rowNumber, message: 'Trạng thái không được bỏ trống' });
                return;
            }

            validUnits.push({
                unitName,
                unitCode,
                description,
                status,
                createdBy: userId,
            });
        });

        if (validUnits.length === 0) {
            throw new ValidationError('Không tìm thấy dữ liệu hợp lệ để import');
        }

        const codeSet = new Set();
        const duplicateCodesInFile = validUnits.filter(u => {
            if (codeSet.has(u.unitCode)) return true;
            codeSet.add(u.unitCode);
            return false;
        });

        if (duplicateCodesInFile.length > 0) {
            const duplicatesStr = duplicateCodesInFile.map(d => d.unitCode).join(', ');
            throw new ValidationError(`Phát hiện mã đơn vị trùng lặp trong file: ${duplicatesStr}`);
        }

        const incomingCodes = validUnits.map(u => u.unitCode);

        const existingUnits = await prisma.unit.findMany({
            where: { unitCode: { in: incomingCodes } },
            select: { unitCode: true }
        });

        const existingCodeSet = new Set(existingUnits.map(u => u.unitCode));

        const toInsert = validUnits.filter(u => !existingCodeSet.has(u.unitCode));
        const duplicateCodesInDb = validUnits.filter(u => existingCodeSet.has(u.unitCode)).map(u => u.unitCode);

        if (duplicateCodesInDb.length > 0) {
            errors.push({
                row: 'N/A',
                message: `Các mã đơn vị sau đã tồn tại trong hệ thống và bị bỏ qua: ${duplicateCodesInDb.join(', ')}`
            });
        }

        let importedCount = 0;
        if (toInsert.length > 0) {
            const { count } = await prisma.unit.createMany({
                data: toInsert,
                skipDuplicates: true,
            });
            importedCount = count;
            
            logActivity('import', userId, 'units', {
                action: 'import_units',
                importedCount,
            });
        }

        return {
            importedCount,
            totalProcessed: items.length,
            errors,
        };
    }
}

export default new UnitService();
