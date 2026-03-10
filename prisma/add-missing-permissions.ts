import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Thêm quyền còn thiếu vào database...\n');

  try {
    // 1. Thêm quyền WAREHOUSE_MANAGEMENT
    console.log('📝 Đang thêm quyền WAREHOUSE_MANAGEMENT...');
    const warehousePermission = await prisma.permission.upsert({
      where: { permissionKey: 'WAREHOUSE_MANAGEMENT' },
      update: {
        permissionName: 'Quản lý kho',
        module: 'warehouse',
        moduleLabel: 'Kho hàng',
      },
      create: {
        permissionKey: 'WAREHOUSE_MANAGEMENT',
        permissionName: 'Quản lý kho',
        module: 'warehouse',
        moduleLabel: 'Kho hàng',
      },
    });
    console.log(`   ✅ Quyền WAREHOUSE_MANAGEMENT (ID: ${warehousePermission.id})`);

    // 2. Thêm quyền view_reports
    console.log('\n📝 Đang thêm quyền view_reports...');
    const viewReportsPermission = await prisma.permission.upsert({
      where: { permissionKey: 'view_reports' },
      update: {
        permissionName: 'Xem báo cáo',
        module: 'report',
        moduleLabel: 'Báo cáo',
      },
      create: {
        permissionKey: 'view_reports',
        permissionName: 'Xem báo cáo',
        module: 'report',
        moduleLabel: 'Báo cáo',
      },
    });
    console.log(`   ✅ Quyền view_reports (ID: ${viewReportsPermission.id})`);

    // 3. Tìm role admin
    console.log('\n📝 Đang tìm role admin...');
    const adminRole = await prisma.role.findUnique({
      where: { roleKey: 'admin' },
    });

    if (!adminRole) {
      console.log('   ⚠️  Không tìm thấy role admin');
      return;
    }
    console.log(`   ✅ Tìm thấy role admin (ID: ${adminRole.id})`);

    // 4. Gán quyền cho role admin
    console.log('\n📝 Đang gán quyền cho role admin...');
    
    // Kiểm tra xem quyền đã được gán chưa
    const existingPermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: adminRole.id,
        permissionId: {
          in: [warehousePermission.id, viewReportsPermission.id],
        },
      },
    });

    const existingPermissionIds = existingPermissions.map(rp => rp.permissionId);
    const permissionsToAdd = [];

    if (!existingPermissionIds.includes(warehousePermission.id)) {
      permissionsToAdd.push({
        roleId: adminRole.id,
        permissionId: warehousePermission.id,
      });
    } else {
      console.log('   ℹ️  Quyền WAREHOUSE_MANAGEMENT đã được gán cho admin');
    }

    if (!existingPermissionIds.includes(viewReportsPermission.id)) {
      permissionsToAdd.push({
        roleId: adminRole.id,
        permissionId: viewReportsPermission.id,
      });
    } else {
      console.log('   ℹ️  Quyền view_reports đã được gán cho admin');
    }

    if (permissionsToAdd.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionsToAdd,
        skipDuplicates: true,
      });
      console.log(`   ✅ Đã gán ${permissionsToAdd.length} quyền mới cho role admin`);
    }

    // 5. Kiểm tra kết quả
    console.log('\n📊 Kiểm tra kết quả...');
    const adminPermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: adminRole.id,
        permissionId: {
          in: [warehousePermission.id, viewReportsPermission.id],
        },
      },
      include: {
        permission: true,
      },
    });

    console.log('\n✅ Quyền của role admin:');
    adminPermissions.forEach(rp => {
      console.log(`   - ${rp.permission.permissionKey}: ${rp.permission.permissionName}`);
    });

    console.log('\n✅ Hoàn tất! Các quyền đã được thêm thành công.');
    console.log('\n📌 Lưu ý: User cần đăng xuất và đăng nhập lại để quyền có hiệu lực.');

  } catch (error) {
    console.error('\n❌ Lỗi khi thêm quyền:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Script thất bại:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
