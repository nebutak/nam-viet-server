import { PrismaClient, NotificationType, NotificationPriority, NotificationChannel, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@utils/errors';
import RedisService, { CachePrefix } from './redis.service';
import { logActivity } from '@utils/logger';
import emailService from './email.service';

const prisma = new PrismaClient();
const redis = RedisService.getInstance();

interface CreateNotificationInput {
  userId: number;
  senderId?: number;
  title: string;
  message: string;
  notificationType?: NotificationType;
  priority?: NotificationPriority;
  channel?: NotificationChannel;
  referenceType?: string;
  referenceId?: number;
  metaData?: any;
  expiresAt?: Date;
}

interface SendNotificationToUsersInput {
  userIds: number[];
  title: string;
  message: string;
  notificationType?: NotificationType;
  priority?: NotificationPriority;
  channel?: NotificationChannel;
  referenceType?: string;
  referenceId?: number;
  metaData?: any;
}

class NotificationService {
  // =====================================================
  // CREATE NOTIFICATIONS
  // =====================================================

  // Create single notification
  async create(data: CreateNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        senderId: data.senderId,
        title: data.title,
        message: data.message,
        notificationType: data.notificationType || 'system',
        priority: data.priority || 'normal',
        channel: data.channel || 'web',
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        metaData: data.metaData,
        expiresAt: data.expiresAt,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        sender: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    // Send email if channel includes email
    if (data.channel === 'email' || data.channel === 'all') {
      await this.sendEmailNotification(notification);
    }

    // Invalidate cache
    await redis.del(`${CachePrefix.USER}notifications:${data.userId}`);

    logActivity('create', data.userId, 'notification', { notificationId: notification.id });

    return notification;
  }

  // Send notification to multiple users
  async sendToUsers(data: SendNotificationToUsersInput) {
    const notifications = await prisma.$transaction(
      data.userIds.map((userId) =>
        prisma.notification.create({
          data: {
            userId,
            title: data.title,
            message: data.message,
            notificationType: data.notificationType || 'system',
            priority: data.priority || 'normal',
            channel: data.channel || 'web',
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            metaData: data.metaData,
          },
        })
      )
    );

    // Clear cache for all affected users
    await Promise.all(
      data.userIds.map((userId) => redis.del(`${CachePrefix.USER}notifications:${userId}`))
    );

    // Send emails if needed
    if (data.channel === 'email' || data.channel === 'all') {
      const users = await prisma.user.findMany({
        where: { id: { in: data.userIds } },
        select: { id: true, email: true, fullName: true },
      });

      await Promise.all(
        users.map((user) =>
          emailService.sendNotificationEmail(user.email, {
            name: user.fullName,
            title: data.title,
            message: data.message,
          })
        )
      );
    }

    return notifications;
  }

  // Send notification to all users with specific role
  async sendToRole(roleId: number, data: Omit<SendNotificationToUsersInput, 'userIds'>) {
    const users = await prisma.user.findMany({
      where: { roleId, status: 'active' },
      select: { id: true },
    });

    const userIds = users.map((u) => u.id);

    if (userIds.length === 0) {
      throw new ValidationError('No active users found for this role');
    }

    return this.sendToUsers({ ...data, userIds });
  }

  // =====================================================
  // READ NOTIFICATIONS
  // =====================================================

  // Get all notifications for a user
  async getByUserId(
    userId: number,
    params: {
      isRead?: boolean;
      notificationType?: NotificationType;
      priority?: NotificationPriority;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { isRead, notificationType, priority, page = 1, limit = 20 } = params;

    const where: Prisma.NotificationWhereInput = {
      userId,
      deletedAt: null,
      ...(isRead !== undefined && { isRead }),
      ...(notificationType && { notificationType }),
      ...(priority && { priority }),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get unread notifications count
  async getUnreadCount(userId: number): Promise<number> {
    const cacheKey = `${CachePrefix.USER}unread_count:${userId}`;
    const cached = await redis.get<number>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
        deletedAt: null,
      },
    });

    await redis.set(cacheKey, count, 300); // Cache for 5 minutes

    return count;
  }

  // Get notification by ID
  async getById(id: bigint, userId: number) {
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!notification) {
      throw new NotFoundError('Notification');
    }

    return notification;
  }

  // =====================================================
  // UPDATE NOTIFICATIONS
  // =====================================================

  // Mark notification as read
  async markAsRead(id: bigint, userId: number) {
    const notification = await this.getById(id, userId);

    if (notification.isRead) {
      return notification;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    // Clear cache
    await redis.del(`${CachePrefix.USER}notifications:${userId}`);
    await redis.del(`${CachePrefix.USER}unread_count:${userId}`);

    return updated;
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId: number) {
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        deletedAt: null,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    // Clear cache
    await redis.del(`${CachePrefix.USER}notifications:${userId}`);
    await redis.del(`${CachePrefix.USER}unread_count:${userId}`);

    return { success: true, message: 'All notifications marked as read' };
  }

  // =====================================================
  // DELETE NOTIFICATIONS
  // =====================================================

  // Soft delete notification
  async delete(id: bigint, userId: number) {
    await this.getById(id, userId);

    await prisma.notification.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    // Clear cache
    await redis.del(`${CachePrefix.USER}notifications:${userId}`);
    await redis.del(`${CachePrefix.USER}unread_count:${userId}`);

    return { success: true, message: 'Notification deleted successfully' };
  }

  // Delete all read notifications for a user
  async deleteAllRead(userId: number) {
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: true,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // Clear cache
    await redis.del(`${CachePrefix.USER}notifications:${userId}`);

    return { success: true, message: 'All read notifications deleted' };
  }

  // =====================================================
  // AUTOMATIC NOTIFICATIONS
  // =====================================================

  // Low stock notification
  async notifyLowStock(inventoryData: {
    productId: number;
    productName: string;
    warehouseId: number;
    warehouseName: string;
    currentQuantity: number;
    minStockLevel: number;
    unit: string;
  }) {
    // Get warehouse manager and admin
    const [warehouse, admins] = await Promise.all([
      prisma.warehouse.findUnique({
        where: { id: inventoryData.warehouseId },
        select: { managerId: true },
      }),
      prisma.user.findMany({
        where: {
          role: { roleKey: 'admin' },
          status: 'active',
        },
        select: { id: true },
      }),
    ]);

    const userIds: number[] = [];
    if (warehouse?.managerId) userIds.push(warehouse.managerId);
    userIds.push(...admins.map((a) => a.id));

    if (userIds.length === 0) return;

    await this.sendToUsers({
      userIds: Array.from(new Set(userIds)), // Remove duplicates
      title: 'Cảnh báo tồn kho thấp',
      message: `Sản phẩm "${inventoryData.productName}" tại ${inventoryData.warehouseName} chỉ còn ${inventoryData.currentQuantity} ${inventoryData.unit}, dưới mức tối thiểu ${inventoryData.minStockLevel} ${inventoryData.unit}`,
      notificationType: 'low_stock',
      priority: 'high',
      channel: 'all',
      referenceType: 'product',
      referenceId: inventoryData.productId,
      metaData: {
        productName: inventoryData.productName,
        warehouseName: inventoryData.warehouseName,
        currentQuantity: inventoryData.currentQuantity,
        minStockLevel: inventoryData.minStockLevel,
        unit: inventoryData.unit,
      },
    });
  }

  // Expiry warning notification
  async notifyExpiryWarning(productData: {
    productId: number;
    productName: string;
    batchNumber: string;
    expiryDate: Date;
    daysRemaining: number;
  }) {
    const [warehouseManagers, admins] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: { roleKey: 'warehouse_staff' },
          status: 'active',
        },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: {
          role: { roleKey: 'admin' },
          status: 'active',
        },
        select: { id: true },
      }),
    ]);

    const userIds = [
      ...warehouseManagers.map((w) => w.id),
      ...admins.map((a) => a.id),
    ];

    await this.sendToUsers({
      userIds: Array.from(new Set(userIds)),
      title: 'Sản phẩm sắp hết hạn',
      message: `Lô hàng "${productData.productName}" (${productData.batchNumber}) sẽ hết hạn sau ${productData.daysRemaining} ngày`,
      notificationType: 'expiry_warning',
      priority: 'high',
      channel: 'all',
      referenceType: 'product',
      referenceId: productData.productId,
      metaData: {
        productName: productData.productName,
        batchNumber: productData.batchNumber,
        expiryDate: productData.expiryDate,
        daysRemaining: productData.daysRemaining,
      },
    });
  }

  // Debt overdue notification
  async notifyDebtOverdue(debtData: {
    customerId: number;
    customerName: string;
    debtAmount: number;
    daysOverdue: number;
  }) {
    const accountants = await prisma.user.findMany({
      where: {
        role: { roleKey: 'accountant' },
        status: 'active',
      },
      select: { id: true },
    });

    if (accountants.length === 0) return;

    await this.sendToUsers({
      userIds: accountants.map((a) => a.id),
      title: 'Công nợ quá hạn',
      message: `Khách hàng "${debtData.customerName}" có khoản nợ ${debtData.debtAmount.toLocaleString('vi-VN')}đ quá hạn ${debtData.daysOverdue} ngày`,
      notificationType: 'debt_overdue',
      priority: 'high',
      channel: 'all',
      referenceType: 'customer',
      referenceId: debtData.customerId,
      metaData: {
        customerName: debtData.customerName,
        debtAmount: debtData.debtAmount,
        daysOverdue: debtData.daysOverdue,
      },
    });
  }

  // New order notification
  async notifyNewOrder(orderData: {
    orderId: number;
    orderCode: string;
    customerName: string;
    totalAmount: number;
  }) {
    const [warehouseStaff, admins] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: { roleKey: 'warehouse_staff' },
          status: 'active',
        },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: {
          role: { roleKey: 'admin' },
          status: 'active',
        },
        select: { id: true },
      }),
    ]);

    const userIds = [
      ...warehouseStaff.map((w) => w.id),
      ...admins.map((a) => a.id),
    ];

    await this.sendToUsers({
      userIds: Array.from(new Set(userIds)),
      title: 'Đơn hàng mới',
      message: `Đơn hàng ${orderData.orderCode} từ "${orderData.customerName}" trị giá ${orderData.totalAmount.toLocaleString('vi-VN')}đ cần xử lý`,
      notificationType: 'order_new',
      priority: 'normal',
      channel: 'web',
      referenceType: 'sales_order',
      referenceId: orderData.orderId,
      metaData: {
        orderCode: orderData.orderCode,
        customerName: orderData.customerName,
        totalAmount: orderData.totalAmount,
      },
    });
  }

  // Approval required notification
  async notifyApprovalRequired(approvalData: {
    type: string; // 'production_order', 'promotion', 'stock_transfer', etc.
    id: number;
    code: string;
    description: string;
    requestedBy: string;
  }) {
    const admins = await prisma.user.findMany({
      where: {
        role: { roleKey: 'admin' },
        status: 'active',
      },
      select: { id: true },
    });

    if (admins.length === 0) return;

    await this.sendToUsers({
      userIds: admins.map((a) => a.id),
      title: 'Yêu cầu phê duyệt',
      message: `${approvalData.description} "${approvalData.code}" từ ${approvalData.requestedBy} đang chờ phê duyệt`,
      notificationType: 'approval_required',
      priority: 'high',
      channel: 'all',
      referenceType: approvalData.type,
      referenceId: approvalData.id,
      metaData: {
        type: approvalData.type,
        code: approvalData.code,
        description: approvalData.description,
        requestedBy: approvalData.requestedBy,
      },
    });
  }

  // =====================================================
  // TICKET & TASK NOTIFICATIONS
  // =====================================================

  // New ticket notification
  async notifyNewTicket(ticketData: {
    ticketId: number;
    ticketCode: string;
    title: string;
    customerName: string;
    priority: string;
  }) {
    // Notify admins and customer support
    const users = await prisma.user.findMany({
      where: {
        role: { roleKey: { in: ['admin', 'customer_support', 'sale'] } },
        status: 'active',
      },
      select: { id: true },
    });

    if (users.length === 0) return;

    await this.sendToUsers({
      userIds: users.map((u) => u.id),
      title: 'Yêu cầu hỗ trợ mới',
      message: `Phiếu #${ticketData.ticketCode}: ${ticketData.title} đã được tạo bởi ${ticketData.customerName}`,
      notificationType: 'system',
      priority: ticketData.priority === 'urgent' || ticketData.priority === 'high' ? 'high' : 'normal',
      channel: 'web',
      referenceType: 'ticket',
      referenceId: ticketData.ticketId,
      metaData: ticketData,
    });
  }

  // Ticket assigned notification
  async notifyTicketAssigned(data: {
    ticketId: number;
    ticketCode: string;
    title: string;
    assigneeId: number;
    assignerName: string;
  }) {
    await this.create({
      userId: data.assigneeId,
      title: 'Được phân công phiếu hỗ trợ',
      message: `Bạn đã được phân công xử lý phiếu #${data.ticketCode}: ${data.title} bởi ${data.assignerName}`,
      notificationType: 'system',
      priority: 'normal',
      channel: 'web',
      referenceType: 'ticket',
      referenceId: data.ticketId,
      metaData: data,
    });
  }

  // Ticket status change notification
  async notifyTicketStatusChange(data: {
    ticketId: number;
    ticketCode: string;
    title: string;
    oldStatus: string;
    newStatus: string;
    creatorId: number; // To notify the creator
    updaterName: string;
  }) {
    // Don't notify if creator is the updater (optional logic, but keep simple for now)
    
    await this.create({
      userId: data.creatorId,
      title: 'Cập nhật trạng thái phiếu hỗ trợ',
      message: `Phiếu #${data.ticketCode}: ${data.title} đã chuyển từ ${data.oldStatus} sang ${data.newStatus}`,
      notificationType: 'system',
      priority: 'normal',
      channel: 'web',
      referenceType: 'ticket',
      referenceId: data.ticketId,
      metaData: data,
    });
  }

  // Task assigned notification
  async notifyTaskAssigned(data: {
    taskId: number;
    title: string;
    assigneeId: number;
    assignerName: string;
    dueDate?: Date | null;
  }) {
    await this.create({
      userId: data.assigneeId,
      title: 'Được phân công công việc',
      message: `Bạn được phân công công việc: ${data.title} ${data.dueDate ? `(Hạn: ${data.dueDate.toLocaleDateString('vi-VN')})` : ''}`,
      notificationType: 'system',
      priority: 'normal',
      channel: 'web',
      referenceType: 'task',
      referenceId: data.taskId,
      metaData: data,
    });
  }

  // =====================================================
  // EMAIL NOTIFICATIONS
  // =====================================================

  private async sendEmailNotification(notification: any) {
    try {
      if (!notification.user?.email) return;

      await emailService.sendNotificationEmail(notification.user.email, {
        name: notification.user.fullName,
        title: notification.title,
        message: notification.message,
      });
    } catch (error) {
      console.error('Failed to send email notification:', error);
      // Don't throw error, just log it
    }
  }

  // =====================================================
  // CLEANUP
  // =====================================================

  // Delete old expired notifications
  async cleanupExpired() {
    const result = await prisma.notification.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return {
      success: true,
      message: `${result.count} expired notifications deleted`,
      count: result.count,
    };
  }

  // Delete old soft-deleted notifications (older than 30 days)
  async cleanupDeleted() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.notification.deleteMany({
      where: {
        deletedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    return {
      success: true,
      message: `${result.count} old deleted notifications permanently removed`,
      count: result.count,
    };
  }
}

export default new NotificationService();
