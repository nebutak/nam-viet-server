import { PrismaClient } from '@prisma/client';
import reportService from '../services/report.service';

const prisma = new PrismaClient();

async function main() {
  try {
    const stats = await reportService.getDashboardStats({ period: 'month' });
    console.log(JSON.stringify(stats, (key, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    , 2));
  } catch (error) {
    console.error('Error explicitly caught:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
