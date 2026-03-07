import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bắt đầu seed quyền Báo cáo...\n');

  try {
    // Tạo các quyền báo cáo
    const reportPermissions = [
      { key: "GET_REPORT", name: "Xem báo cáo", module: "report", moduleLabel: "Báo cáo" },
      { key: "EXPORT_REPORT", name: "Xuất báo cáo", module: "report", moduleLabel: "Báo cáo" },
      { key: "REPORT_PURCHASE_VIEW", name: "Xem báo cáo mua hàng", module: "report", moduleLabel: "Báo cáo" },
      { key: "REPORT_UNDELIVERED_VIEW", name: "Xem báo cáo chưa giao", module: "report", moduleLabel: "Báo cáo" },
      { key: "REPORT_UNRECEIVED_VIEW", name: "Xem báo cáo chưa nhận", module: "report", moduleLabel: "Báo cáo" },
    ];

    const createdPermissions = [];
    for (const p of reportPermissions) {
      const permission = await prisma.permission.upsert({
        where: { permissionKey: p.key },
        update: { moduleLabel: p.moduleLabel },
        create: {
          permissionKey: p.key,
          permissionName: p.name,
          module: p.module,
          moduleLabel: p.moduleLabel,
        },
      });
      createdPermissions.push(permission);
      console.log(`✅ ${p.key} - ${p.name}`);
    }

    // Gán quyền cho role admin
    const adminRole = await prisma.role.findFirst({
      where: { roleKey: 'admin' }
    });

    if (adminRole) {
      const adminUser = await prisma.user.findFirst({
        where: { roleId: adminRole.id }
      });

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
            assignedBy: adminUser?.id,
          },
        });
      }
      console.log(`\n✅ Đã gán ${createdPermissions.length} quyền cho role Admin`);
    }

    console.log('\n✅ Seed quyền báo cáo thành công!');

  } catch (error) {
    console.error('❌ Lỗi khi seed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
