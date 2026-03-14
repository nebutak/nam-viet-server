import { PrismaClient } from '@prisma/client';
import { seedAttendance } from './attendance-seed-hovtoi';
import { seedOvertime } from './overtime-seed-hovtoi';
import { seedSalary } from './salary-seed-hovtoi';

const prisma = new PrismaClient();

async function main() {
  // await seedPurchaseAndInventory(prisma);
  // await seedSalesAndReturns(prisma);
  await seedAttendance(prisma);
  await seedOvertime(prisma);
  await seedSalary(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
