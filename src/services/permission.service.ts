import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

class PermissionService {
  // Get all permissions (optionally grouped by module)
  async getAllPermissions() {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ id: 'asc' }],
      select: {
        id: true,
        permissionKey: true,
        permissionName: true,
        description: true,
        module: true,
        moduleLabel: true,
        createdAt: true,
      },
    });

    // Group by module
    const grouped = permissions.reduce((acc: any, permission) => {
      const moduleKey = permission.module || 'general';
      if (!acc[moduleKey]) {
        acc[moduleKey] = {
          label: permission.moduleLabel || moduleKey.toUpperCase(),
          permissions: []
        };
      }
      acc[moduleKey].permissions.push(permission);
      return acc;
    }, {});

    const result = {
      permissions,
      grouped,
    };

    return result;
  }

  // Get permissions by module
  async getPermissionsByModule(module: string) {
    const allPermissions = await this.getAllPermissions();
    const modulePermissions = allPermissions.grouped[module] || [];

    return modulePermissions;
  }

  // Check if user has permission
  async checkUserPermission(userId: number, permissionKey: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.role) {
      return false;
    }

    const hasPermission = user.role.rolePermissions.some(
      (rp) => rp.permission.permissionKey === permissionKey
    );

    return hasPermission;
  }

}

export default new PermissionService();
