import * as cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import notificationService from '@services/notification.service';

const prisma = new PrismaClient();

class NotificationScheduler {
  private jobs: cron.ScheduledTask[] = [];

  // Initialize all scheduled jobs
  init() {
    console.log('🔔 Initializing notification scheduler...');

    // Daily check at 8:00 AM
    this.scheduleDailyChecks();

    // Cleanup expired notifications - every day at 2:00 AM
    this.scheduleCleanup();

    console.log('✅ Notification scheduler initialized');
  }

  // Schedule daily checks (8:00 AM)
  private scheduleDailyChecks() {
    const job = cron.schedule('0 8 * * *', async () => {
      console.log('⏰ Running daily notification checks...');

      try {
        await Promise.all([
          this.checkLowStock(),
          this.checkExpiringProducts(),
          this.checkOverdueDebts(),
        ]);
        console.log('✅ Daily notification checks completed');
      } catch (error) {
        console.error('❌ Error in daily notification checks:', error);
      }
    });

    this.jobs.push(job);
    console.log('✅ Daily checks scheduled for 8:00 AM');
  }

  // Schedule cleanup (2:00 AM)
  private scheduleCleanup() {
    const job = cron.schedule('0 2 * * *', async () => {
      console.log('🧹 Running notification cleanup...');

      try {
        const [expiredResult, deletedResult] = await Promise.all([
          notificationService.cleanupExpired(),
          notificationService.cleanupDeleted(),
        ]);

        console.log('✅ Cleanup completed:', {
          expired: expiredResult.count,
          deleted: deletedResult.count,
        });
      } catch (error) {
        console.error('❌ Error in notification cleanup:', error);
      }
    });

    this.jobs.push(job);
    console.log('✅ Cleanup scheduled for 2:00 AM');
  }

  // Check low stock
  async checkLowStock() {
    console.log('📦 Checking low stock...');

    const lowStockItems = await prisma.inventory.findMany({
      where: {
        product: {
          minStockLevel: {
            gt: 0,
          },
        },
      },
      include: {
        product: {
          select: {
            id: true,
            productName: true,
            minStockLevel: true,
            unitId: true,
            unit: { select: { id: true, unitCode: true, unitName: true } },
          },
        },
        warehouse: {
          select: {
            id: true,
            warehouseName: true,
          },
        },
      },
    });

    let notificationCount = 0;

    for (const item of lowStockItems) {
      const availableQty = Number(item.quantity) - Number(item.reservedQuantity);

      if (availableQty < Number(item.product.minStockLevel)) {
        await notificationService.notifyLowStock({
          productId: item.productId,
          productName: item.product.productName,
          warehouseId: item.warehouseId,
          warehouseName: item.warehouse.warehouseName,
          currentQuantity: availableQty,
          minStockLevel: Number(item.product.minStockLevel),
          unit: (item.product.unit as any)?.unitCode || '',
        });
        notificationCount++;
      }
    }

    console.log(`✅ Low stock check completed: ${notificationCount} notifications sent`);
  }

  // Check expiring products (within 7 days)
  async checkExpiringProducts() {
    console.log('📅 Checking expiring products...');

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringProducts = await prisma.stockTransactionDetail.findMany({
      where: {
        expiryDate: {
          lte: sevenDaysFromNow,
          gt: new Date(),
        },
      },
      include: {
        product: {
          select: {
            id: true,
            productName: true,
          },
        },
      },
      distinct: ['productId', 'batchNumber'],
    });

    let notificationCount = 0;

    for (const item of expiringProducts) {
      if (!item.expiryDate) continue;

      const daysRemaining = Math.ceil(
        (item.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      await notificationService.notifyExpiryWarning({
        productId: item.productId,
        productName: item.product.productName,
        batchNumber: item.batchNumber || 'N/A',
        expiryDate: item.expiryDate,
        daysRemaining,
      });
      notificationCount++;
    }

    console.log(`✅ Expiry check completed: ${notificationCount} notifications sent`);
  }

  // Check overdue debts
  async checkOverdueDebts() {
    console.log('💰 Checking overdue debts...');

    // Get customers with debt
    const customersWithDebt = await prisma.customer.findMany({
      where: {
        currentDebt: {
          gt: 0,
        },
        status: 'active',
      },
      select: {
        id: true,
        customerName: true,
        currentDebt: true,
        debtUpdatedAt: true,
      },
    });

    let notificationCount = 0;

    for (const customer of customersWithDebt) {
      if (!customer.debtUpdatedAt) continue;

      const daysSinceDebt = Math.floor(
        (new Date().getTime() - customer.debtUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Consider debt overdue after 30 days
      if (daysSinceDebt > 30) {
        await notificationService.notifyDebtOverdue({
          customerId: customer.id,
          customerName: customer.customerName,
          debtAmount: Number(customer.currentDebt),
          daysOverdue: daysSinceDebt - 30,
        });
        notificationCount++;
      }
    }

    console.log(`✅ Debt check completed: ${notificationCount} notifications sent`);
  }

  // Stop all jobs
  stopAll() {
    console.log('🛑 Stopping all notification jobs...');
    this.jobs.forEach((job) => job.stop());
    this.jobs = [];
    console.log('✅ All notification jobs stopped');
  }

  // Manually trigger checks (for testing)
  async runAllChecksNow() {
    console.log('🔔 Manually running all checks...');
    await Promise.all([
      this.checkLowStock(),
      this.checkExpiringProducts(),
      this.checkOverdueDebts(),
    ]);
    console.log('✅ Manual checks completed');
  }
}

export default new NotificationScheduler();
