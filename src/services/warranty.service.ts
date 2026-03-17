import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import emailService from '@services/email.service';
import {
  CreateWarrantyInput,
  WarrantyQueryInput,
  SendReminderEmailInput,
} from '@validators/warranty.validator';

const prisma = new PrismaClient();

class WarrantyService {
  async getAll(params: WarrantyQueryInput) {
    const {
      page = 1,
      limit = 20,
      search,
      customerId,
      productId,
      invoiceId,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const offset = (page - 1) * limit;

    const where: Prisma.WarrantyWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { serialNumber: { contains: search } },
          { note: { contains: search } },
          { invoice: { orderCode: { contains: search } } },
          { product: { productName: { contains: search } } },
          { customer: { customerName: { contains: search } } },
        ],
      }),
      ...(customerId && { customerId }),
      ...(productId && { productId }),
      ...(invoiceId && { invoiceId }),
      ...(status && { status }),
    };

    const total = await prisma.warranty.count({ where });

    const warranties = await prisma.warranty.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            productName: true,
            code: true,
          },
        },
        customer: {
          select: {
            id: true,
            customerName: true,
            phone: true,
            email: true,
          },
        },
        invoice: {
          select: {
            id: true,
            orderCode: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
    });

    return {
      warranties: warranties.map((w) => ({
        ...w,
        // For frontend compatibility if needed
        customer: {
          ...w.customer,
          name: w.customer.customerName,
        },
        product: {
          ...w.product,
          name: w.product.productName,
        },
        invoice: {
          ...w.invoice,
          code: w.invoice.orderCode,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: number) {
    const warranty = await prisma.warranty.findUnique({
      where: { id },
      include: {
        product: true,
        customer: true,
        invoice: true,
      },
    });

    if (!warranty || warranty.deletedAt) {
      throw new NotFoundError('Warranty');
    }

    return {
      ...warranty,
      customer: {
        ...warranty.customer,
        name: warranty.customer.customerName,
      },
      product: {
        ...warranty.product,
        name: warranty.product.productName,
      },
      invoice: {
        ...warranty.invoice,
        code: warranty.invoice.orderCode,
      },
    };
  }

  async create(data: CreateWarrantyInput, userId: number) {
    const warranty = await prisma.warranty.create({
      data: {
        customerId: data.customerId,
        productId: data.productId,
        invoiceId: data.invoiceId,
        invoiceDetailId: data.invoiceDetailId,
        serialNumber: data.serialNumber,
        quantity: data.quantity,
        periodMonths: data.periodMonths,
        warrantyCost: data.warrantyCost || 0,
        subTotal: Number(data.quantity) * (Number(data.warrantyCost) || 0),
        amount: Number(data.quantity) * (Number(data.warrantyCost) || 0),
        status: 'pending',
        note: data.note,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    logActivity('create', userId, 'warranties', {
      recordId: warranty.id,
      newValue: warranty,
    });

    return warranty;
  }

  async updateStatus(id: number, status: string, userId: number) {
    const warranty = await prisma.warranty.findUnique({
      where: { id },
    });

    if (!warranty || warranty.deletedAt) {
      throw new NotFoundError('Warranty');
    }

    const data: any = {
      status,
      updatedBy: userId,
    };

    if (status === 'active' && !warranty.startDate) {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + warranty.periodMonths);

      const reminderDate = new Date(endDate);
      reminderDate.setMonth(reminderDate.getMonth() - 1);

      data.startDate = startDate;
      data.endDate = endDate;
      data.nextReminderDate = reminderDate;
    }

    if (status === 'expired') {
      data.nextReminderDate = null;
    }

    const updatedWarranty = await prisma.warranty.update({
      where: { id },
      data,
    });

    logActivity('update', userId, 'warranties', {
      recordId: id,
      oldValue: warranty,
      newValue: updatedWarranty,
    });

    return updatedWarranty;
  }

  async delete(id: number, userId: number) {
    const warranty = await prisma.warranty.findUnique({
      where: { id },
    });

    if (!warranty || warranty.deletedAt) {
      throw new NotFoundError('Warranty');
    }

    await prisma.warranty.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    logActivity('delete', userId, 'warranties', {
      recordId: id,
      oldValue: warranty,
    });

    return { success: true };
  }

  async sendReminderEmail(id: number, userId: number, payload: SendReminderEmailInput) {
    const warranty = await prisma.warranty.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        invoice: true,
      },
    });

    if (!warranty || warranty.deletedAt) {
      throw new NotFoundError('Warranty');
    }

    if (!warranty.customer.email) {
      throw new ValidationError('Khách hàng chưa có địa chỉ email');
    }

    const endDateStr = warranty.endDate ? new Date(warranty.endDate).toLocaleDateString('vi-VN') : '—';
    
    const subject = payload.subject || `Thông báo hết hạn bảo hành: ${warranty.product.productName}`;
    const defaultContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Thông báo hết hạn bảo hành</h2>
        <p>Thân gửi Quý khách <strong>${warranty.customer.customerName}</strong>,</p>
        <p>Chúng tôi xin thông báo sản phẩm của Quý khách sắp hết hạn bảo hành:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; width: 150px;"><strong>Sản phẩm:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${warranty.product.productName} (${warranty.product.code})</td>
          </tr>
          ${warranty.serialNumber ? `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Số S/N:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${warranty.serialNumber}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Mã hóa đơn:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${warranty.invoice.orderCode}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Ngày hết hạn:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #d32f2f;"><strong>${endDateStr}</strong></td>
          </tr>
        </table>
        <p>Quý khách vui lòng kiểm tra lại tình trạng sản phẩm hoặc liên hệ với chúng tôi nếu cần hỗ trợ thêm.</p>
        <p>Trân trọng cảm ơn!</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">Đây là email tự động từ hệ thống quản lý Công ty Nam Việt. Vui lòng không trả lời email này.</p>
      </div>
    `;

    const content = payload.content || defaultContent;

    const sent = await emailService.sendEmail({
      to: warranty.customer.email,
      subject,
      html: content,
    });

    if (sent) {
      await prisma.warranty.update({
        where: { id },
        data: {
          lastReminderDate: new Date(),
          updatedBy: userId,
        },
      });

      logActivity('update', userId, 'warranties', {
        recordId: id,
        note: 'Đã gửi email nhắc bảo hành',
      });
    }

    return { success: sent };
  }
}

export default new WarrantyService();
