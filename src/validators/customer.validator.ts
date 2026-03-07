import { z } from 'zod';

export const createCustomerSchema = z.object({
  customerCode: z
    .string()
    .min(1, 'Mã khách hàng không được để trống')
    .max(50, 'Mã khách hàng tối đa 50 ký tự'),
  customerName: z
    .string()
    .min(1, 'Tên khách hàng không được để trống')
    .max(200, 'Tên khách hàng tối đa 200 ký tự'),
  customerType: z.enum(['individual', 'company'], { message: 'Loại khách hàng không hợp lệ' }),
  gender: z.enum(['male', 'female', 'other'], { message: 'Giới tính không hợp lệ' }).optional(),
  contactPerson: z.string().max(100, 'Người liên hệ tối đa 100 ký tự').optional(),
  phone: z
    .string()
    .min(10, 'Số điện thoại phải có ít nhất 10 ký tự')
    .max(20, 'Số điện thoại tối đa 20 ký tự')
    .regex(/^[0-9+\-\s()]+$/, 'Định dạng số điện thoại không hợp lệ'),
  email: z
    .string()
    .email('Định dạng email không hợp lệ')
    .max(100, 'Email tối đa 100 ký tự')
    .optional()
    .or(z.literal('')),
  address: z.string().max(255, 'Địa chỉ tối đa 255 ký tự').optional(),
  taxCode: z.string().max(50, 'Mã số thuế tối đa 50 ký tự').optional(),
  cccd: z.string().min(1, 'CCCD không được để trống').max(20, 'CCCD không được quá 20 ký tự'),
  issuedAt: z.string().nullable().optional(),
  issuedBy: z.string().max(100, 'Nơi cấp không được quá 100 ký tự').optional().or(z.literal('')),
  creditLimit: z.number().min(0, 'Hạn mức tín dụng phải lớn hơn hoặc bằng 0').optional(),
  rewardPoints: z.number().int().min(0, 'Điểm thưởng phải lớn hơn hoặc bằng 0').optional(),
  rewardCode: z.string().max(50, 'Mã thưởng tối đa 50 ký tự').optional(),
  status: z.enum(['active', 'inactive', 'blacklisted'], { message: 'Trạng thái không hợp lệ' }).optional(),
  notes: z.string().max(255, 'Ghi chú tối đa 255 ký tự').optional(),
});

export const updateCustomerSchema = z.object({
  customerName: z
    .string()
    .min(1, 'Tên khách hàng không được để trống')
    .max(200, 'Tên khách hàng tối đa 200 ký tự')
    .optional(),
  customerType: z
    .enum(['individual', 'company'], { message: 'Loại khách hàng không hợp lệ' })
    .optional(),
  gender: z.enum(['male', 'female', 'other'], { message: 'Giới tính không hợp lệ' }).optional(),
  contactPerson: z.string().max(100, 'Người liên hệ tối đa 100 ký tự').optional(),
  phone: z
    .string()
    .min(10, 'Số điện thoại phải có ít nhất 10 ký tự')
    .max(20, 'Số điện thoại tối đa 20 ký tự')
    .regex(/^[0-9+\-\s()]+$/, 'Định dạng số điện thoại không hợp lệ')
    .optional(),
  email: z
    .string()
    .email('Định dạng email không hợp lệ')
    .max(100, 'Email tối đa 100 ký tự')
    .optional()
    .or(z.literal('')),
  address: z.string().max(255, 'Địa chỉ tối đa 255 ký tự').optional(),
  taxCode: z.string().max(50, 'Mã số thuế tối đa 50 ký tự').optional(),
  cccd: z.string().min(1, 'CCCD không được để trống').max(20, 'CCCD không được quá 20 ký tự'),
  issuedAt: z.string().nullable().optional(),
  issuedBy: z.string().max(100, 'Nơi cấp không được quá 100 ký tự').optional().or(z.literal('')),
  creditLimit: z.number().min(0, 'Hạn mức tín dụng phải lớn hơn hoặc bằng 0').optional(),
  rewardPoints: z.number().int().min(0, 'Điểm thưởng phải lớn hơn hoặc bằng 0').optional(),
  rewardCode: z.string().max(50, 'Mã thưởng tối đa 50 ký tự').optional(),
  status: z.enum(['active', 'inactive', 'blacklisted'], { message: 'Trạng thái không hợp lệ' }).optional(),
  notes: z.string().max(255, 'Ghi chú tối đa 255 ký tự').optional(),
});

export const updateCreditLimitSchema = z.object({
  creditLimit: z.number().min(0, 'Hạn mức tín dụng phải lớn hơn hoặc bằng 0'),
  reason: z.string().min(10, 'Lý do phải có ít nhất 10 ký tự').max(255, 'Lý do tối đa 255 ký tự'),
});

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'blacklisted'], { message: 'Trạng thái không hợp lệ' }),
  reason: z
    .string()
    .min(10, 'Lý do phải có ít nhất 10 ký tự')
    .max(255, 'Lý do tối đa 255 ký tự')
    .optional(),
});

export const queryCustomersSchema = z.object({
  page: z.string().regex(/^\d+$/, 'Số trang phải là số nguyên dương').transform(Number).optional(),
  limit: z.string().regex(/^\d+$/, 'Giới hạn phải là số nguyên dương').transform(Number).optional(),
  search: z.string().optional(),
  customerType: z
    .enum(['individual', 'company'], { message: 'Loại khách hàng không hợp lệ' })
    .optional(),
  status: z
    .enum(['active', 'inactive', 'blacklisted'], { message: 'Trạng thái không hợp lệ' })
    .optional(),
  debtStatus: z
    .enum(['with-debt', 'no-debt', 'over-limit'], {
      message: 'Trạng thái khách hàng khóa tín dụng không hợp lệ',
    })
    .optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc'], { message: 'Thứ tự sắp xếp không hợp lệ' }).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type UpdateCreditLimitInput = z.infer<typeof updateCreditLimitSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type CustomerQueryInput = z.infer<typeof queryCustomersSchema>;
