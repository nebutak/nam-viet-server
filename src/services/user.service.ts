import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '@utils/password';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { logActivity } from '@utils/logger';
import uploadService from './upload.service';
import type {
  CreateUserInput,
  UpdateUserInput,
  UpdateUserStatusInput,
  QueryUsersInput,
} from '@validators/user.validator';

const prisma = new PrismaClient();

class UserService {
  // Get all users with pagination, filters, and search
  async getAllUsers(query: QueryUsersInput) {
    const {
      page = '1',
      limit = '20',
      search,
      roleId,
      warehouseId,
      status,
      gender,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Prisma.UserWhereInput = {
      ...(search && {
        OR: [
          { fullName: { contains: search } },
          { email: { contains: search } },
          { employeeCode: { contains: search } },
          { phone: { contains: search } },
        ],
      }),
      ...(roleId && { roleId: parseInt(roleId) }),
      ...(warehouseId && { warehouseId: parseInt(warehouseId) }),
      ...(status && { status }),
      ...(gender && { gender }),
    };

    // Execute queries in parallel
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          employeeCode: true,
          email: true,
          fullName: true,
          phone: true,
          address: true,
          gender: true,
          dateOfBirth: true,
          avatarUrl: true,
          roleId: true,
          warehouseId: true,
          status: true,
          canEditProfile: true,
          createdAt: true,
          updatedAt: true,
          lastLogin: true,
          role: {
            select: {
              id: true,
              roleKey: true,
              roleName: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              warehouseCode: true,
              warehouseName: true,
              warehouseType: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const result = {
      data: users,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    return result;
  }

  async getUserById(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        employeeCode: true,
        email: true,
        fullName: true,
        phone: true,
        address: true,
        cccd: true,
        issuedAt: true,
        issuedBy: true,
        gender: true,
        dateOfBirth: true,
        avatarUrl: true,
        roleId: true,
        warehouseId: true,
        status: true,
        canEditProfile: true,
        createdBy: true,
        updatedBy: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        role: {
          select: {
            id: true,
            roleKey: true,
            roleName: true,
            description: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            warehouseCode: true,
            warehouseName: true,
            warehouseType: true,
            address: true,
            city: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('Không tìm thấy nhân viên!');
    }

    return user;
  }

  // Create new user
  async createUser(data: CreateUserInput, createdBy: number) {
    const emailExists = await this.checkEmailExists(data.email);

    if (emailExists) {
      throw new ConflictError('Email đã tồn tại');
    }

    const employeeCodeExists = await this.checkEmployeeCodeExists(data.employeeCode);

    if (employeeCodeExists) {
      throw new ConflictError('Mã nhân viên đã tồn tại');
    }

    const roleExists = await prisma.role.findUnique({
      where: { id: data.roleId },
    });

    if (!roleExists) {
      throw new NotFoundError('Không tìm thấy vai trò');
    }

    if (data.warehouseId) {
      const warehouseExists = await prisma.warehouse.findUnique({
        where: { id: data.warehouseId },
      });
      if (!warehouseExists) {
        throw new NotFoundError('Kho không tìm thấy');
      }
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        employeeCode: data.employeeCode,
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        phone: data.phone || null,
        address: data.address || null,
        cccd: data.cccd || null,
        issuedAt: data.issuedAt ? new Date(data.issuedAt) : null,
        issuedBy: data.issuedBy || null,
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        roleId: data.roleId,
        warehouseId: data.warehouseId || null,
        status: data.status || 'active',
        createdBy,
      },
      select: {
        id: true,
        employeeCode: true,
        email: true,
        fullName: true,
        phone: true,
        address: true,
        gender: true,
        dateOfBirth: true,
        avatarUrl: true,
        roleId: true,
        warehouseId: true,
        status: true,
        canEditProfile: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            roleKey: true,
            roleName: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            warehouseCode: true,
            warehouseName: true,
            warehouseType: true,
          },
        },
      },
    });

    logActivity('create', createdBy, 'users', {
      recordId: user.id,
      newValue: { ...user, passwordHash: '[HIDDEN]' },
    });

    return user;
  }

  // Update user
  async updateUser(id: number, data: UpdateUserInput, updatedBy: number) {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundError('Nhân viên không tìm thấy!');
    }

    // Check email uniqueness (if changing)
    if (data.email && data.email !== existingUser.email) {
      const emailExists = await this.checkEmailExists(data.email, id);
      if (emailExists) {
        throw new ConflictError('Email đã tồn tại');
      }
    }

    // Check employee code uniqueness (if changing)
    if (data.employeeCode && data.employeeCode !== existingUser.employeeCode) {
      const employeeCodeExists = await this.checkEmployeeCodeExists(data.employeeCode, id);
      if (employeeCodeExists) {
        throw new ConflictError('Mã nhân viên đã tồn tại');
      }
    }

    // Verify role exists (if changing)
    if (data.roleId) {
      const roleExists = await prisma.role.findUnique({
        where: { id: data.roleId },
      });
      if (!roleExists) {
        throw new NotFoundError('Vai trò không tìm thấy');
      }
    }

    // Verify warehouse exists (if changing)
    if (data.warehouseId) {
      const warehouseExists = await prisma.warehouse.findUnique({
        where: { id: data.warehouseId },
      });
      if (!warehouseExists) {
        throw new NotFoundError('Kho không tìm thấy');
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(data.employeeCode && { employeeCode: data.employeeCode }),
        ...(data.email && { email: data.email }),
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.cccd !== undefined && { cccd: data.cccd }),
        ...(data.issuedAt !== undefined && { issuedAt: new Date(data.issuedAt) }),
        ...(data.issuedBy !== undefined && { issuedBy: data.issuedBy }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.dateOfBirth !== undefined && {
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        }),
        ...(data.password && data.password.trim() && { passwordHash: await hashPassword(data.password) }),
        ...(data.roleId && { roleId: data.roleId }),
        ...(data.warehouseId !== undefined && { warehouseId: data.warehouseId }),
        ...(data.status && { status: data.status }),
        updatedBy,
      },
      select: {
        id: true,
        employeeCode: true,
        email: true,
        fullName: true,
        phone: true,
        address: true,
        gender: true,
        dateOfBirth: true,
        avatarUrl: true,
        roleId: true,
        warehouseId: true,
        status: true,
        canEditProfile: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            roleKey: true,
            roleName: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            warehouseCode: true,
            warehouseName: true,
            warehouseType: true,
          },
        },
      },
    });

    // Log activity
    logActivity('update', updatedBy, 'users', {
      recordId: id,
      oldValue: existingUser,
      newValue: updatedUser,
    });

    return updatedUser;
  }

  // Delete user (hard delete - permanently remove)
  async deleteUser(id: number, deletedBy: number) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('Nhân viên không tìm thấy');
    }

    // Prevent deleting self
    if (id === deletedBy) {
      throw new ValidationError('Không thể tự xóa tài khoản của mình');
    }

    // Delete avatar file if exists
    if (user.avatarUrl) {
      try {
        await uploadService.deleteAvatar(user.avatarUrl);
      } catch (error) {
        console.error('Error deleting avatar:', error);
        // Continue with user deletion even if avatar delete fails
      }
    }

    // Hard delete user
    await prisma.user.delete({
      where: { id },
    });

    // Log activity
    logActivity('delete', deletedBy, 'users', {
      recordId: id,
      oldValue: user,
    });

    return { message: 'Xóa nhân viên thành công' };
  }

  // Update user status (lock/unlock)
  async updateUserStatus(id: number, data: UpdateUserStatusInput, updatedBy: number) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('Nhân viên không tìm thấy');
    }

    // Prevent changing own status
    if (id === updatedBy) {
      throw new ValidationError('Không thể sửa tài khoản của mình');
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        status: data.status,
        updatedBy,
      },
      select: {
        id: true,
        employeeCode: true,
        email: true,
        fullName: true,
        status: true,
        updatedAt: true,
      },
    });

    // Log activity
    logActivity('update', updatedBy, 'users', {
      recordId: id,
      action: 'status_change',
      oldValue: { status: user.status },
      newValue: { status: data.status },
    });

    return updatedUser;
  }

  // Toggle Can Edit Profile
  async toggleCanEditProfile(id: number, canEditProfile: boolean, updatedBy: number) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('Nhân viên không tìm thấy');
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        canEditProfile,
        updatedBy,
      },
      select: {
        id: true,
        employeeCode: true,
        email: true,
        fullName: true,
        canEditProfile: true,
        updatedAt: true,
      },
    });

    // Log activity
    logActivity('update', updatedBy, 'users', {
      recordId: id,
      action: 'toggle_edit_profile',
      oldValue: { canEditProfile: user.canEditProfile },
      newValue: { canEditProfile },
    });

    return updatedUser;
  }

  // Upload avatar
  async uploadAvatar(userId: number, file: Express.Multer.File) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarUrl: true },
    });

    if (!user) {
      throw new NotFoundError('Nhân viên không tìm thấy');
    }

    // Process and save avatar
    const avatarUrl = await uploadService.processAvatar(file.path, userId);

    // Delete old avatar if exists
    if (user.avatarUrl) {
      await uploadService.deleteAvatar(user.avatarUrl);
    }

    // Update user with new avatar URL
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        avatarUrl: true,
      },
    });

    return updatedUser;
  }

  // Delete avatar
  async deleteAvatar(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarUrl: true },
    });

    if (!user) {
      throw new NotFoundError('Nhân viên không tìm thấy');
    }

    if (!user.avatarUrl) {
      throw new ValidationError('Nhân viên này không có avatar');
    }

    // Delete avatar file
    await uploadService.deleteAvatar(user.avatarUrl);

    // Update user to remove avatar URL
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    return { message: 'Xóa ảnh thành công' };
  }

  // Change user password (admin reset)
  async changePassword(userId: number, newPassword: string, changedBy: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true },
    });

    if (!user) {
      throw new NotFoundError('Nhân viên không tìm thấy');
    }

    // Prevent changing own password (use dedicated endpoint for that)
    if (userId === changedBy) {
      throw new ValidationError(
        'Không thể thay đổi mật khẩu của chính mình, vui lòng sử dụng chức năng đổi mật khẩu cá nhân'
      );
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        updatedBy: changedBy,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
      },
    });

    // Log activity
    logActivity('update', changedBy, 'users', {
      recordId: userId,
      action: 'password_change',
      description: `Admin đã thay đổi mật khẩu cho ${user.fullName}`,
    });

    return updatedUser;
  }

  // Check if email exists
  async checkEmailExists(email: string, excludeUserId?: number): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: {
        email,
        ...(excludeUserId && { id: { not: excludeUserId } }),
      },
    });

    return !!user;
  }

  // Check if employee code exists
  async checkEmployeeCodeExists(code: string, excludeUserId?: number): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: {
        employeeCode: code,
        ...(excludeUserId && { id: { not: excludeUserId } }),
      },
    });

    return !!user;
  }

  // Get activity logs for a user
  async getActivityLogs(userId: number, options: { limit: number; offset: number }) {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundError('Nhân viên không tìm thấy');
    }

    // Fetch activity logs
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where: { userId },
        select: {
          id: true,
          action: true,
          tableName: true,
          recordId: true,
          oldValue: true,
          newValue: true,
          reason: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      prisma.activityLog.count({
        where: { userId },
      }),
    ]);

    // Convert BigInt to string for JSON serialization
    const serializedLogs = logs.map((log) => ({
      ...log,
      id: log.id.toString(),
    }));

    return {
      data: serializedLogs,
      meta: {
        total,
        limit: options.limit,
        offset: options.offset,
        pages: Math.ceil(total / options.limit),
      },
    };
  }
}

export default new UserService();
