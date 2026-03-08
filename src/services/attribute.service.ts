import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import ExcelJS from 'exceljs';
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

    async downloadImportTemplate(): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Nhập liệu Thuộc tính');

        // Instructions
        worksheet.mergeCells('A1:D1');
        worksheet.getCell('A1').value = 'HƯỚNG DẪN NHẬP LIỆU THUỘC TÍNH';
        worksheet.getCell('A1').font = { bold: true, size: 14 };
        worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        const instructions = [
            '1. Các cột có dấu (*) là bắt buộc nhập',
            '2. Tên thuộc tính phải duy nhất. Mã thuộc tính không bắt buộc nhưng nếu nhập thì phải duy nhất.',
            '3. Trạng thái chỉ điền "Hoạt động" hoặc "Ngừng"'
        ];

        instructions.forEach((instruction, idx) => {
            worksheet.getCell(`A${idx + 2}`).value = instruction;
        });

        // Add headers at row 6
        worksheet.getRow(6).values = [
            'STT',
            'Tên thuộc tính (*)',
            'Mã thuộc tính',
            'Loại dữ liệu',
            'Đơn vị',
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
            { width: 30 },  // Tên thuộc tính
            { width: 20 },  // Mã thuộc tính
            { width: 15 },  // Loại dữ liệu
            { width: 15 },  // Đơn vị
            { width: 30 },  // Ghi chú
            { width: 20 },  // Trạng thái
        ];

        return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
    }

    async importAttributes(items: any[], userId: number): Promise<any> {
        if (!items || items.length === 0) {
            throw new ValidationError('Không tìm thấy dữ liệu hợp lệ để import');
        }

        const validAttributes: any[] = [];
        const errors: any[] = [];

        items.forEach((item, index) => {
            const rowNumber = index + 6; // Matching Excel typically using STT

            const name = item.name?.toString().trim();
            const code = item.code?.toString().trim() || null;
            const dataType = item.dataType?.toString().trim() || null;
            const unit = item.unit?.toString().trim() || null;
            const description = item.description?.toString().trim() || null;
            let statusRaw = item.status?.toString().trim().toLowerCase();

            if (!name) {
                errors.push({ row: rowNumber, message: 'Thiếu Tên thuộc tính (*)' });
                return;
            }

            let status = 'published';
            if (statusRaw === 'ngừng' || statusRaw === 'ngung' || statusRaw === 'inactive' || statusRaw === 'archived') {
                status = 'archived';
            } else if (!statusRaw && item.status !== undefined) {
                errors.push({ row: rowNumber, message: 'Trạng thái không được bỏ trống' });
                return;
            }

            validAttributes.push({
                name,
                code,
                dataType,
                unit,
                description,
                status,
                createdBy: userId,
            });
        });

        if (validAttributes.length === 0) {
            throw new ValidationError('Không tìm thấy dữ liệu hợp lệ để import (có thể bị lỗi format)');
        }

        // Check duplicates within the file
        const nameSet = new Set();
        const duplicateNamesInFile = validAttributes.filter(attr => {
            if (nameSet.has(attr.name)) return true;
            nameSet.add(attr.name);
            return false;
        });

        if (duplicateNamesInFile.length > 0) {
            const duplicatesStr = duplicateNamesInFile.map(d => d.name).join(', ');
            throw new ValidationError(`Phát hiện tên thuộc tính trùng lặp trong file: ${duplicatesStr}`);
        }

        // Get existing names to skip inserting duplicates
        const incomingNames = validAttributes.map(a => a.name);
        const existingAttributes = await prisma.attribute.findMany({
            where: { name: { in: incomingNames } },
            select: { name: true }
        });

        const existingNamesSet = new Set(existingAttributes.map(a => a.name));

        const toInsert = validAttributes.filter(a => !existingNamesSet.has(a.name));
        const duplicateNamesInDb = validAttributes.filter(a => existingNamesSet.has(a.name)).map(a => a.name);

        if (duplicateNamesInDb.length > 0) {
            errors.push({
                row: 'N/A',
                message: `Các thuộc tính sau đã tồn tại trong hệ thống và bị bỏ qua: ${duplicateNamesInDb.join(', ')}`
            });
        }

        let importedCount = 0;
        if (toInsert.length > 0) {
            const { count } = await prisma.attribute.createMany({
                data: toInsert,
                skipDuplicates: true,
            });
            importedCount = count;

            logActivity('import', userId, 'attributes', {
                action: 'import_attributes',
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

export default new AttributeService();
