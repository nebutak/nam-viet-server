import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function check() { 
    const exp = await prisma.inventoryBatch.findMany(); 
    console.log('All Batches:', exp.map(e => e.expiryDate)); 
    
    const overdue = await prisma.invoice.findMany({ 
        where: { paymentStatus: { in: ['pending', 'partial'] } },
        select: { createdAt: true }
    }); 
    console.log('Pending Invoices Dates:', overdue.map(o => o.createdAt));
} 
check().then(() => prisma.$disconnect());
