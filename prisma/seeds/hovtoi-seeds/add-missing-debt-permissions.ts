import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Adding CREATE_DEBT_RECONCILIATION and UPDATE_DEBT_RECONCILIATION permissions...\n');

  const permissionsToUpsert = [
    {
      permissionKey: 'CREATE_DEBT_RECONCILIATION',
      permissionName: 'Tạo đối chiếu công nợ',
      module: 'debt',
      moduleLabel: 'Công nợ',
    },
    {
      permissionKey: 'UPDATE_DEBT_RECONCILIATION',
      permissionName: 'Cập nhật đối chiếu công nợ',
      module: 'debt',
      moduleLabel: 'Công nợ',
    }
  ];

  for (const perm of permissionsToUpsert) {
    const permission = await prisma.permission.upsert({
      where: { permissionKey: perm.permissionKey },
      update: { moduleLabel: perm.moduleLabel },
      create: perm,
    });
    console.log(`✅ Permission created/updated: ${permission.permissionKey} (id: ${permission.id})`);

    // Assign to admin role
    const adminRole = await prisma.role.findFirst({
      where: { roleKey: 'admin' },
    });

    if (adminRole) {
       const adminUser = await prisma.user.findFirst({
        where: { role: { roleKey: 'admin' } },
        select: { id: true },
      });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: adminRole.id,
          permissionId: permission.id,
          assignedBy: adminUser?.id ?? 1,
        },
      });
      console.log(`✅ Assigned ${perm.permissionKey} to role: admin`);
    }
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
