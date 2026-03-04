import { z } from 'zod';

// Create role schema
export const createRoleSchema = z.object({
  roleKey: z
    .string()
    .min(1, 'Role key là bắt buộc')
    .max(50, 'Role key phải có tối đa 50 ký tự.')
    .regex(/^[a-z_]+$/, 'Role key chỉ được chứa chữ cái viết thường và dấu gạch dưới.'),
  roleName: z
    .string()
    .min(1, 'Role name là bắt buộc')
    .max(100, 'Role name phải có tối đa 100 ký tự.'),
  description: z.string().max(500, 'Description phải có tối đa 500 ký tự.').optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active').optional(),
});

// Update role schema
export const updateRoleSchema = z.object({
  roleName: z
    .string()
    .min(1, 'Role name là bắt buộc')
    .max(100, 'Role name phải có tối đa 100 ký tự.')
    .optional(),
  description: z.string().max(500, 'Description phải có tối đa 500 ký tự.').optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

// Delete role schema
export const deleteRoleSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Role ID phải là một số.'),
});

// Assign permissions to role schema
export const assignPermissionsSchema = z.object({
  permissionIds: z
    .array(z.number().int().positive('Permission ID phải là một số nguyên dương.'))
    .min(0, 'Danh sách quyền không hợp lệ.')
    .max(500, 'Tối đa 500 quyền được cho phép.'),
});

export const queryRolesSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Export types
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type AssignPermissionsInput = z.infer<typeof assignPermissionsSchema>;
export type QueryRolesInput = z.infer<typeof queryRolesSchema>;
