import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const checkDate = new Date();

    console.log("Current date:", checkDate.toISOString());

    const allPromos = await prisma.promotion.findMany({
        select: { id: true, promotionCode: true, status: true, startDate: true, endDate: true }
    });
    console.log("All promos debug:");
    console.table(allPromos);

    const activePromos = await prisma.promotion.findMany({
        where: {
            status: 'active',
            startDate: { lte: checkDate },
            endDate: { gte: checkDate },
        }
    });

    console.log("Active promos matching query:", activePromos.length);
}

main().finally(() => prisma.$disconnect());
