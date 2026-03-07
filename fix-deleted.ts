import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const deletedSuppliers = await prisma.supplier.findMany({
            where: { deletedAt: { not: null } }
        });
        console.log(`Found ${deletedSuppliers.length} deleted suppliers.`);

        for (const supplier of deletedSuppliers) {
            if (!supplier.supplierCode.includes('-DEL-')) {
                const uniqueSuffix = `-DEL-${Date.now()}`;
                const truncatedCode = supplier.supplierCode.substring(0, 50 - uniqueSuffix.length);
                const newCode = `${truncatedCode}${uniqueSuffix}`;

                await prisma.supplier.update({
                    where: { id: supplier.id },
                    data: { supplierCode: newCode }
                });
                console.log(`Updated supplier ${supplier.id} code from ${supplier.supplierCode} to ${newCode}`);
            }
        }
        console.log('Fix complete.');
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
