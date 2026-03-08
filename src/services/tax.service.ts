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

    async downloadImportTemplate(type: 'excel' | 'csv') {
        if (type !== 'excel') {
            throw new Error('Chỉ hỗ trợ template Excel');
        }

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Mau_Them_Thue');

        worksheet.getColumn(1).width = 35;
        worksheet.getColumn(2).width = 20;
        worksheet.getColumn(3).width = 20;

        worksheet.mergeCells('A1:C1');
        worksheet.getCell('A1').value = 'HƯỚNG DẪN NHẬP LIỆU (VUI LÒNG KHÔNG XÓA 5 DÒNG ĐẦU)';
        worksheet.getCell('A1').font = { bold: true, color: { argb: 'FFFF0000' } };
        
        worksheet.getCell('A2').value = '- Cột "Tên thuế": Bắt buộc nhập. Ví dụ: Thuế VAT 10%';
        worksheet.getCell('A3').value = '- Cột "Tỷ lệ (%)": Bắt buộc nhập số hợp lệ. Ví dụ: 10, 5.5';
        worksheet.getCell('A4').value = '- Cột "Trạng thái": Nhập "Hoạt động" hoặc "Khóa". Bỏ trống mặc định là Hoạt động.';

        // Format header
        const headerRow = worksheet.getRow(5);
        headerRow.values = ['Tên thuế (*)', 'Tỷ lệ (%) (*)', 'Trạng thái'];
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Thêm dữ liệu mẫu
        worksheet.addRow(['Thuế VAT 10%', 10, 'Hoạt động']);
        worksheet.addRow(['Thuế Tiêu thụ đặc biệt', 5, 'Khóa']);

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    }

    async import(data: any[], userId: number) {
        let successCount = 0;
        let errors: any[] = [];
        
        // Prisma transaction to ensure all or nothing if possible, but here we process row by row for clear error reporting
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            const rowNumber = i + 2; // +1 for 0-index, +1 for header

            try {
                // Validation is already done mostly on frontend, but we can double check
                if (!item.title) {
                    throw new Error('Tên thuế là bắt buộc');
                }

                await prisma.tax.create({
                    data: {
                        title: item.title,
                        percentage: item.percentage || 0,
                        status: item.status || 'active',
                        createdBy: userId
                    }
                });

                successCount++;
            } catch (error: any) {
                errors.push({
                    row: rowNumber,
                    errors: [{ field: 'Dòng', message: error.message || 'Lỗi không xác định' }]
                });
            }
        }

        if (errors.length > 0) {
            throw { importErrors: errors };
        }

        logActivity('import', userId, 'taxes', { count: successCount });
        
        return {
            success: true,
            message: `Nhập thành công ${successCount} dữ liệu`,
            count: successCount
        };
    }
}

export default new TaxService();
