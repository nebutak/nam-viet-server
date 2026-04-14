import { PrismaClient } from '@prisma/client';
import reportService from '../services/report.service';

const prisma = new PrismaClient();

async function main() {
  try {
    const stats = await reportService.getDashboardStats({ period: 'month' });
    console.log("REVENUE TREND:", JSON.stringify(stats.charts.revenue_trend, null, 2));
    console.log("SALES CHANNELS:", JSON.stringify(stats.charts.sales_channels, null, 2));
    console.log("INVENTORY SHARE:", JSON.stringify(stats.charts.inventory_share, null, 2));
  } catch (error) {
    console.error('Error explicitly caught:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
