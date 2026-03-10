import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roleKey = process.argv[2] || 'admin'; // Có thể truyền role qua command line
  
  console.log(`🔧 Gán quyền báo cáo tồn kho cho role: ${roleKey}\n`);

  try {
    // 1. Tìm role
    const role = await prisma.role.findUnique({
      where: { roleKey },
    });

    if (!role) {
      console.error(`❌ Không tìm thấy role: ${roleKey}`);
      console.log('\n💡 Các role có sẵn:');
      const allRoles = await prisma.role.findMany();
      allRoles.forEach(r => console.log(`   - ${r.roleKey}: ${r.roleName}`));
      return;
    }

    console.log(`✅ Tìm thấy role: ${role.roleName} (ID: ${role.id})`);

    // 2. Tìm các quyền cần thiết
    const permissionKeys = [
      'GET_CATEGORY',
      'GET_WAREHOUSE_IMPORT',
      'GET_WAREHOUSE_EXPORT',
      'GET_INVENTORY_REPORT'
    ];

    const permissions = await prisma.permission.findMany({
      where: {
        permissionKey: { in: permissionKeys }
      }
    });

    console.log(`\n✅ Tìm thấy ${permissions.length}/${permissionKeys.length} quyền:`);
    permissions.forEach(p => {
      console.log(`   - ${p.permissionKey}: ${p.permissionName}`);
    });

    if (permissions.length < permissionKeys.length) {
      const foundKeys = permissions.map(p => p.permissionKey);
      const missingKeys = permissionKeys.filter(k => !foundKeys.includes(k));
      console.log(`\n⚠️  Thiếu ${missingKeys.length} quyền trong database:`);
      missingKeys.forEach(k => console.log(`   - ${k}`));
      console.log('\n💡 Vui lòng chạy seed hoặc thêm quyền này vào database trước.');
      return;
    }

    // 3. Kiểm tra quyền đã có
    const existingPermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: role.id,
        permissionId: { in: permissions.map(p => p.id) }
      },
      include: { permission: true }
    });

    const existingPermissionIds = existingPermissions.map(rp => rp.permissionId);

    if (existingPermissions.length > 0) {
      console.log(`\n📋 Role đã có ${existingPermissions.length} quyền:`);
      existingPermissions.forEach(rp => {
        console.log(`   ✓ ${rp.permission.permissionKey}: ${rp.permission.permissionName}`);
      });
    }

    // 4. Gán quyền mới
    const permissionsToAdd = permissions
      .filter(p => !existingPermissionIds.includes(p.id))
      .map(p => ({
        roleId: role.id,
        permissionId: p.id
      }));

    if (permissionsToAdd.length > 0) {
      console.log(`\n📝 Đang gán ${permissionsToAdd.length} quyền mới...`);
      
      await prisma.rolePermission.createMany({
        data: permissionsToAdd,
        skipDuplicates: true
      });

      const addedPermissions = permissions.filter(p => 
        permissionsToAdd.some(pa => pa.permissionId === p.id)
      );
      
      addedPermissions.forEach(p => {
        console.log(`   + ${p.permissionKey}: ${p.permissionName}`);
      });

      console.log(`\n✅ Đã gán ${permissionsToAdd.length} quyền mới cho role ${role.roleName}`);
    } else {
      console.log(`\n✅ Role ${role.roleName} đã có đủ tất cả quyền cần thiết`);
    }

    // 5. Hiển thị tổng kết
    const finalPermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: role.id,
        permissionId: { in: permissions.map(p => p.id) }
      },
      include: { permission: true }
    });

    console.log(`\n📊 Tổng kết quyền của role ${role.roleName}:`);
    console.log(`   Tổng số quyền cần thiết: ${permissions.length}`);
    console.log(`   Đã có: ${finalPermissions.length}`);
    console.log('\n   Chi tiết:');
    finalPermissions.forEach(rp => {
      console.log(`   ✓ ${rp.permission.permissionKey}: ${rp.permission.permissionName}`);
    });

    // 6. Đếm số user có role này
    const userCount = await prisma.user.count({
      where: { roleId: role.id }
    });

    console.log(`\n👥 Số user có role này: ${userCount}`);
    
    if (userCount > 0) {
      console.log('\n📌 LƯU Ý QUAN TRỌNG:');
      console.log('   - User cần ĐĂNG XUẤT và ĐĂNG NHẬP LẠI để quyền có hiệu lực');
      console.log('   - Quyền được lưu trong JWT token, token cũ không có quyền mới');
    }

    console.log('\n✅ Hoàn tất!');

  } catch (error) {
    console.error('\n❌ Lỗi khi gán quyền:', error);
    throw error;
  }
}

main()
  .catch(e => {
    console.error('❌ Script thất bại:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
