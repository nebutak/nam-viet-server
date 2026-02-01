import { z } from 'zod';

export const createTicketSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống').max(200, 'Tiêu đề tối đa 200 ký tự'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], { message: 'Độ ưu tiên không hợp lệ' }).optional().default('medium'),
  customerId: z.number().int(),
  assignedToId: z.number().int().optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().max(200, 'Tiêu đề tối đa 200 ký tự').optional(),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed'], { message: 'Trạng thái không hợp lệ' }).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], { message: 'Độ ưu tiên không hợp lệ' }).optional(),
  assignedToId: z.number().int().optional().nullable(), // Nullable to unassign
});

export const queryTicketsSchema = z.object({
  page: z.string().regex(/^\d+$/, 'Số trang phải là số nguyên dương').transform(Number).optional(),
  limit: z.string().regex(/^\d+$/, 'Giới hạn phải là số nguyên dương').transform(Number).optional(),
  search: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'all']).optional(), // 'all' handled in service
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  customerId: z.string().regex(/^\d+$/).transform(Number).optional(),
  assignedToId: z.string().regex(/^\d+$/).transform(Number).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type TicketQueryInput = z.infer<typeof queryTicketsSchema>;
