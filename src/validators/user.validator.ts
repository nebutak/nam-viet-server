import { z } from 'zod';

// Enum validation
const genderEnum = z.enum(['male', 'female', 'other']);
const userStatusEnum = z.enum(['active', 'inactive', 'locked']);

// Base user fields for creation
export const createUserSchema = z.object({
  employeeCode: z
    .string()
    .min(3, 'Mã nhân viên phải có ít nhất 3 ký tự.')
    .max(50, 'Mã nhân viên không được vượt quá 50 ký tự.')
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      'Mã nhân viên chỉ được chứa chữ cái, số, dấu gạch ngang và dấu gạch dưới.'
    ),
  email: z.string().email('Định dạng email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự.')
    .regex(/[A-Z]/, 'Mật khẩu phải chứa ít nhất một chữ cái viết hoa.')
    .regex(/[a-z]/, 'Mật khẩu phải chứa ít nhất một chữ cái thường.')
    .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất một số.')
    .regex(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      'Mật khẩu phải chứa ít nhất một ký tự đặc biệt.'
    ),
  fullName: z
    .string('Tên không hợp lệ')
    .min(2, 'Mật khẩu phải chứa ít nhất một ký tự đặc biệt.')
    .max(200, 'Họ và tên đầy đủ không được vượt quá 200 ký tự.'),
  phone: z
    .string()
    .regex(/^[0-9+\-\s()]+$/, 'Định dạng số điện thoại không hợp lệ')
    .max(20, 'Số điện thoại không được vượt quá 20 ký tự.')
    .optional(),
  address: z.string().max(255, 'Địa chỉ không được vượt quá 255 ký tự.').optional(),
  cccd: z.string().max(20, 'CCCD không được quá 20 ký tự').optional().or(z.literal('')),
  issuedAt: z.string().optional(),
  issuedBy: z.string().max(100, 'Nơi cấp không được quá 100 ký tự').optional().or(z.literal('')),
  gender: genderEnum.optional(),
  dateOfBirth: z
    .string()
    .refine((date) => {
      const parsedDate = new Date(date);
      const today = new Date();
      return parsedDate < today;
    }, 'Ngày sinh phải là ngày trong quá khứ.')
    .optional(),
  roleId: z.number().int().positive('Mã định danh vai trò phải là một số nguyên dương.'),
  warehouseId: z.number().int().positive('Mã số kho phải là một số nguyên dương.').optional(),
  status: userStatusEnum.optional().default('active'),
});

// Update user schema (all fields optional except restrictions)
export const updateUserSchema = z.object({
  employeeCode: z
    .string()
    .min(3, 'Mã nhân viên phải có ít nhất 3 ký tự.')
    .max(50, 'Mã nhân viên không được vượt quá 50 ký tự.')
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      'Mã nhân viên chỉ được chứa chữ cái, số, dấu gạch ngang và dấu gạch dưới.'
    )
    .optional(),
  email: z.string().email('Định dạng email không hợp lệ').optional(),
  password: z
    .string()
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự.')
    .regex(/[A-Z]/, 'Mật khẩu phải chứa ít nhất một chữ cái viết hoa.')
    .regex(/[a-z]/, 'Mật khẩu phải chứa ít nhất một chữ cái thường.')
    .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất một số.')
    .regex(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      'Mật khẩu phải chứa ít nhất một ký tự đặc biệt.'
    )
    .optional()
    .or(z.literal('')),
  fullName: z
    .string()
    .min(2, 'Họ và tên phải có ít nhất 2 ký tự.')
    .max(200, 'Họ và tên đầy đủ không được vượt quá 200 ký tự.')
    .optional(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s()]+$/, 'Định dạng số điện thoại không hợp lệ')
    .max(20, 'Số điện thoại không được vượt quá 20 ký tự.')
    .optional()
    .nullable(),
  address: z.string().max(255, 'Địa chỉ không được vượt quá 255 ký tự.').optional().nullable(),
  cccd: z.string().max(20, 'CCCD không được quá 20 ký tự').optional().or(z.literal('')),
  issuedAt: z.string().optional(),
  issuedBy: z.string().max(100, 'Nơi cấp không được quá 100 ký tự').optional().or(z.literal('')),
  gender: genderEnum.optional().nullable(),
  dateOfBirth: z
    .string()
    .refine((date) => {
      const parsedDate = new Date(date);
      const today = new Date();
      return parsedDate < today;
    }, 'Ngày sinh phải là ngày trong quá khứ.')
    .optional()
    .nullable(),
  roleId: z.number().int().positive('Mã định danh vai trò phải là một số nguyên dương.').optional(),
  warehouseId: z
    .number()
    .int()
    .positive('Mã số kho phải là một số nguyên dương.')
    .optional()
    .nullable(),
  canEditProfile: z.boolean().optional(),
  status: userStatusEnum.optional(),
});

// Update user status schema
export const updateUserStatusSchema = z.object({
  status: userStatusEnum,
});

// Query/filter users schema
export const queryUsersSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().max(200, 'Từ khóa tìm kiếm không được vượt quá 200 ký tự.').optional(),
  roleId: z.string().regex(/^\d+$/).optional(),
  warehouseId: z.string().regex(/^\d+$/).optional(),
  status: userStatusEnum.optional(),
  gender: genderEnum.optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'fullName', 'email', 'employeeCode', 'lastLogin'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Get user by ID schema
export const getUserByIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Mã định danh người dùng phải là số.'),
});

// Delete user schema
export const deleteUserSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Mã định danh người dùng phải là số.'),
});

// Export types
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type QueryUsersInput = z.infer<typeof queryUsersSchema>;
