import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const invoices = await prisma.invoice.findMany({
    where: { orderStatus: { not: 'cancelled' } },
    include: { details: true },
    orderBy: { orderDate: 'desc' }
  });
  
  console.log('=== Invoice Summary (non-cancelled) ===');
  let totalNet = 0, totalPaid = 0, totalDiscount = 0, grossRev = 0;
  
  for (const inv of invoices) {
    const net = Number(inv.totalAmount);
    const paid = Number(inv.paidAmount);
    let discount = 0;
    let gross = 0;
    inv.details.forEach(d => {
      gross += Number(d.price) * Number(d.quantity);
      discount += Number(d.discountAmount || 0);
    });
    
    totalNet += net;
    totalPaid += paid;
    totalDiscount += discount;
    grossRev += gross;
    
    console.log(`${inv.orderCode}: net=${net.toLocaleString()}, paid=${paid.toLocaleString()}, discount=${discount.toLocaleString()}, gross=${gross.toLocaleString()}`);
  }
  
  console.log(`\nTotal Net Revenue: ${totalNet.toLocaleString()}`);
  console.log(`Total Paid: ${totalPaid.toLocaleString()}`);
  console.log(`Total Discount: ${totalDiscount.toLocaleString()}`);
  console.log(`Gross Revenue: ${grossRev.toLocaleString()}`);
  console.log(`Debt: ${(totalNet - totalPaid).toLocaleString()}`);
}

check().finally(() => prisma.$disconnect());
