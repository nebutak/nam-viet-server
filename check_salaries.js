const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSalary() {
  const users = await prisma.user.findMany({ take: 3 });
  console.log('Sample Users:', users.map(u => ({ id: u.id, name: u.fullName })));
  
  const lastSalaries = await prisma.salary.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  console.log('Last Salaries:', lastSalaries);
}

checkSalary()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
