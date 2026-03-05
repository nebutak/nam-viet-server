import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const count = await prisma.promotion.count();
    console.log('Total promotions in DB:', count);
    const promos = await prisma.promotion.findMany({ take: 2 });
    console.log(promos);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
