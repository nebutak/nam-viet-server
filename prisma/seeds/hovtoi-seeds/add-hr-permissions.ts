import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Adding HR + Debt permissions to Admin role...');

  const hrPermissionsData = [
    // Attendance
    { key: "view_attendance", name: "Xem bảng công", module: "attendance", moduleLabel: "Chấm công" },
    { key: "update_attendance", name: "Cập nhật bảng công", module: "attendance", moduleLabel: "Chấm công" },
    { key: "delete_attendance", name: "Xóa log chấm công", module: "attendance", moduleLabel: "Chấm công" },
    { key: "approve_leave", name: "Duyệt xin nghỉ", module: "attendance", moduleLabel: "Chấm công" },
    // Salary
    { key: "view_salary", name: "Xem bảng lương", module: "salary", moduleLabel: "Lương" },
    { key: "update_salary", name: "Cập nhật lương", module: "salary", moduleLabel: "Lương" },
    { key: "delete_salary", name: "Xóa bảng lương", module: "salary", moduleLabel: "Lương" },
    { key: "calculate_salary", name: "Tính lương", module: "salary", moduleLabel: "Lương" },
    { key: "approve_salary", name: "Duyệt lương", module: "salary", moduleLabel: "Lương" },
    { key: "pay_salary", name: "Thanh toán lương", module: "salary", moduleLabel: "Lương" },
    // Debt / Công nợ
    { key: "VIEW_DEBT_RECONCILIATION", name: "Xem công nợ", module: "debt", moduleLabel: "Công nợ" },
    { key: "CREATE_DEBT_RECONCILIATION", name: "Tạo/Đồng bộ công nợ", module: "debt", moduleLabel: "Công nợ" },
  ];

  // Create permissions
  const permissions = [];
  for (const p of hrPermissionsData) {
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
    permissions.push(permission);
  }
  console.log(`✅ Created ${permissions.length} permissions (HR + Debt)`);

  // Find Admin user and role
  const adminRole = await prisma.role.findUnique({ where: { roleKey: 'admin' } });
  const adminUser = await prisma.user.findFirst({ where: { roleId: adminRole?.id } });

  if (!adminRole || !adminUser) {
    console.log('⚠️ Admin role or user not found');
    return;
  }

  // Assign to Admin Role
  const rolePermissions = await Promise.all(
    permissions.map((p) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: p.id,
          },
        },
        update: {},
        create: {
          roleId: adminRole.id,
          permissionId: p.id,
          assignedBy: adminUser.id,
        },
      })
    )
  );

  console.log(`✅ Assigned ${rolePermissions.length} permissions to Admin role`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
