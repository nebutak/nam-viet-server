import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Adding VIEW_DEBT_RECONCILIATION permission...\n');

  // 1. Upsert the permission
  const permission = await prisma.permission.upsert({
    where: { permissionKey: 'VIEW_DEBT_RECONCILIATION' },
    update: { moduleLabel: 'Công nợ' },
    create: {
      permissionKey: 'VIEW_DEBT_RECONCILIATION',
      permissionName: 'Xem đối chiếu công nợ',
      module: 'debt',
      moduleLabel: 'Công nợ',
    },
  });
  console.log(`✅ Permission created/updated: ${permission.permissionKey} (id: ${permission.id})`);

  // 2. Find all roles that should have this permission (admin, accountant, sales_staff)
  const targetRoleKeys = ['admin', 'accountant', 'sales_staff'];
  const roles = await prisma.role.findMany({
    where: { roleKey: { in: targetRoleKeys } },
  });

  // 3. Assign permission to each role
  for (const role of roles) {
    // Find any admin user to use as assignedBy (fallback to first user)
    const adminUser = await prisma.user.findFirst({
      where: { role: { roleKey: 'admin' } },
      select: { id: true },
    });

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: permission.id,
        assignedBy: adminUser?.id ?? 1,
      },
    });
    console.log(`✅ Assigned VIEW_DEBT_RECONCILIATION to role: ${role.roleKey}`);
  }

  console.log('\n✅ Done!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
