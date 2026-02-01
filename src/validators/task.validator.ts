import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống').max(200, 'Tiêu đề tối đa 200 ký tự'),
  description: z.string().optional(),
  dueDate: z.string().datetime({ message: 'Ngày hết hạn không hợp lệ (ISO 8601)' }).optional(),
  priority: z.enum(['low', 'medium', 'high'], { message: 'Độ ưu tiên không hợp lệ' }).optional().default('medium'),
  type: z.enum(['call', 'email', 'meeting', 'other'], { message: 'Loại nhiệm vụ không hợp lệ' }).default('call'),
  customerId: z.number().int(),
  assignedToId: z.number().int().optional(),
  relatedTicketId: z.number().int().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().max(200, 'Tiêu đề tối đa 200 ký tự').optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled'], { message: 'Trạng thái không hợp lệ' }).optional(),
  priority: z.enum(['low', 'medium', 'high'], { message: 'Độ ưu tiên không hợp lệ' }).optional(),
  type: z.enum(['call', 'email', 'meeting', 'other'], { message: 'Loại nhiệm vụ không hợp lệ' }).optional(),
  assignedToId: z.number().int().optional().nullable(),
  relatedTicketId: z.number().int().optional().nullable(),
});

export const queryTasksSchema = z.object({
  page: z.string().regex(/^\d+$/, 'Số trang phải là số nguyên dương').transform(Number).optional(),
  limit: z.string().regex(/^\d+$/, 'Giới hạn phải là số nguyên dương').transform(Number).optional(),
  search: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  type: z.enum(['call', 'email', 'meeting', 'other']).optional(),
  customerId: z.string().regex(/^\d+$/).transform(Number).optional(),
  assignedToId: z.string().regex(/^\d+$/).transform(Number).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQueryInput = z.infer<typeof queryTasksSchema>;
