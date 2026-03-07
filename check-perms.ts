import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    const users = await prisma.user.findMany({
        include: {
            role: {
                include: {
                    rolePermissions: {
                        include: { permission: true }
                    }
                }
            }
        }
    });

    for (const u of users) {
        console.log(`User: ${u.email}, Role: ${u.role?.roleKey}, Permissions: ${u.role?.rolePermissions.length}`);
        if (u.role?.roleKey === 'admin') {
            const perms = u.role.rolePermissions.map(rp => rp.permission.permissionKey);
            console.log(`Admin has view_inventory? ${perms.includes('view_inventory')}`);
            console.log(`Admin has view_stock_transactions? ${perms.includes('view_stock_transactions')}`);
            console.log(`Admin has GET_PRODUCT? ${perms.includes('GET_PRODUCT')}`);
        }
    }
}

check().finally(() => prisma.$disconnect());
