import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const existing = await prisma.supplier.findMany({
            where: { deletedAt: { not: null } }
        });
        console.log('DELETED SUPPLIERS:', existing.map(s => s.supplierCode));
    } catch (e) {
        console.error('ERROR:', e.message);
    }
}

main();
