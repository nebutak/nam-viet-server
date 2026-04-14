import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const latestInvoice = await prisma.invoice.findFirst({ orderBy: { completedAt: 'desc' }, select: { completedAt: true, orderDate: true, orderStatus: true } });
  console.log('Latest invoice:', latestInvoice);
  const counts = await prisma.invoice.groupBy({ by: ['orderStatus'], _count: true });
  console.log('Invoice status counts:', counts);
  process.exit(0);
}
main();
