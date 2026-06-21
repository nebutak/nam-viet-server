const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    let perm = await prisma.permission.findFirst({
        where: { permissionKey: 'CREATE_DEBT_RECONCILIATION' }
    });
    if (!perm) {
        perm = await prisma.permission.create({
            data: { permissionKey: 'CREATE_DEBT_RECONCILIATION', permissionName: 'Tạo đối chiếu công nợ', module: 'Công nợ' }
        });
        console.log('Created CREATE_DEBT_RECONCILIATION');
    }
    const roles = await prisma.role.findMany();
    for (const r of roles) {
        const rel = await prisma.rolePermission.findFirst({
            where: { roleId: r.id, permissionId: perm.id }
        });
        if (!rel) {
            await prisma.rolePermission.create({
                data: { roleId: r.id, permissionId: perm.id }
            });
        }
    }
    console.log('Assigned CREATE_DEBT_RECONCILIATION to all roles');
}
run().catch(console.error).finally(()=>prisma.$disconnect());
