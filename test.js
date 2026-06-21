const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { smartDebtService } = require('./src/services/smart-debt.service');

async function main() {
  const result = await smartDebtService.syncSnap({
    customerId: 4,
    year: 2026,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().finally(() => prisma.$disconnect());
