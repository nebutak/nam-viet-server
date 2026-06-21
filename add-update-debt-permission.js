const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    // 1. Ensure UPDATE_DEBT_RECONCILIATION permission exists
    let perm = await prisma.permission.findFirst({
        where: { permissionKey: 'UPDATE_DEBT_RECONCILIATION' }
    });
    if (!perm) {
        perm = await prisma.permission.create({
            data: {
                permissionKey: 'UPDATE_DEBT_RECONCILIATION',
                permissionName: 'Cập nhật/Danh sách đen công nợ',
                module: 'debt',
                moduleLabel: 'Công nợ'
            }
        });
        console.log('Created UPDATE_DEBT_RECONCILIATION permission');
    } else {
        console.log('UPDATE_DEBT_RECONCILIATION already exists (id:', perm.id, ')');
    }

    // 2. Assign to ALL roles
    const roles = await prisma.role.findMany();
    let assigned = 0;
    for (const r of roles) {
        const existing = await prisma.rolePermission.findFirst({
            where: { roleId: r.id, permissionId: perm.id }
        });
        if (!existing) {
            await prisma.rolePermission.create({
                data: { roleId: r.id, permissionId: perm.id }
            });
            assigned++;
            console.log(`  Assigned to role: ${r.roleName} (id: ${r.id})`);
        }
    }
    console.log(`Done! Assigned UPDATE_DEBT_RECONCILIATION to ${assigned} new roles (${roles.length} total roles)`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
