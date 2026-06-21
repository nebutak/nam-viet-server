const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const res = await prisma.paymentVoucher.findMany({ take: 1 });
    console.log("Success", res);
  } catch (e) {
    console.log('Error Type:', e.constructor.name);
    console.log('Error code:', e.code);
    console.log('Meta:', e.meta);
    console.log('Message:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
