import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Adding report permissions...\n');

  // Danh sách các permission cần tạo
  const reportPermissions = [
    {
      key: 'GET_REVENUE_REPORT',
      name: 'Xem báo cáo doanh thu',
      module: 'report',
      moduleLabel: 'Báo cáo',
    },
    {
      key: 'GET_INVENTORY_REPORT',
      name: 'Xem báo cáo tồn kho',
      module: 'report',
      moduleLabel: 'Báo cáo',
    },
    {
      key: 'GET_SALES_REPORT',
      name: 'Xem báo cáo bán hàng',
      module: 'report',
      moduleLabel: 'Báo cáo',
    },
    {
      key: 'GET_FINANCIAL_REPORT',
      name: 'Xem báo cáo tài chính',
      module: 'report',
      moduleLabel: 'Báo cáo',
    },
  ];

  // 1. Tạo hoặc cập nhật các permissions
  const createdPermissions = [];
  for (const perm of reportPermissions) {
    const permission = await prisma.permission.upsert({
      where: { permissionKey: perm.key },
      update: {
        permissionName: perm.name,
        module: perm.module,
        moduleLabel: perm.moduleLabel,
      },
      create: {
        permissionKey: perm.key,
        permissionName: perm.name,
        module: perm.module,
        moduleLabel: perm.moduleLabel,
      },
    });
    createdPermissions.push(permission);
    console.log(`✅ Permission created/updated: ${permission.permissionKey}`);
  }

  // 2. Tìm role admin
  const adminRole = await prisma.role.findFirst({
    where: { roleKey: 'admin' },
  });

  if (!adminRole) {
    console.error('❌ Admin role not found!');
    return;
  }

  console.log('\n✅ Found admin role:', adminRole.roleName);

  // 3. Tìm admin user
  const adminUser = await prisma.user.findFirst({
    where: { email: 'leeminhkang@gmail.com' },
  });

  if (!adminUser) {
    console.error('❌ Admin user not found!');
    return;
  }

  console.log('✅ Found admin user:', adminUser.email);

  // 4. Gán tất cả permissions cho admin role
  for (const permission of createdPermissions) {
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
        assignedBy: adminUser.id,
      },
    });
    console.log(`✅ Permission ${permission.permissionKey} assigned to admin role`);
  }

  // 5. Kiểm tra tất cả permissions của admin role
  const allAdminPermissions = await prisma.rolePermission.findMany({
    where: { roleId: adminRole.id },
    include: {
      permission: true,
    },
  });

  console.log(`\n✅ Admin role now has ${allAdminPermissions.length} permissions`);
  
  const reportPerms = allAdminPermissions.filter(
    (rp) => rp.permission.module === 'report'
  );
  
  console.log(`✅ Found ${reportPerms.length} report permissions assigned to admin role`);

  console.log('\n🎉 Done! Please logout and login again to see the changes.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
