import { z } from 'zod';

const transactionDetailSchema = z.object({
  productId: z.number().int().positive('Id sản phẩm không hợp lệ'),
  warehouseId: z.number().int().positive('Id kho không hợp lệ').optional(),
  quantity: z.number().positive('Số lượng phải là số dương'),
  unitPrice: z.number().min(0, 'Giá phải lớn hơn 0').optional(),
  batchNumber: z.string().max(100, 'Batch lớn hơn 100').optional(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hết hạn phải là YYYY-MM-DD')
    .or(z.date())
    .optional(),
  notes: z.string().max(500, 'Ghi chú không được quá 500 ký tự').optional(),
});

export const createImportSchema = z.object({
  warehouseId: z.number().int().positive('Id kho không hợp lệ'),
  referenceType: z.string().max(50).optional(),
  referenceId: z.number().int().positive().optional(),
  reason: z.string().max(255).optional(),
  notes: z.string().max(500).optional(),
  details: z
    .array(transactionDetailSchema)
    .min(1, 'Cần ít nhất một mặt hàng')
    .max(100, 'Tối đa 100 mặt hàng cho mỗi giao dịch'),
});

export const createExportSchema = z.object({
  warehouseId: z.number().int().positive('Id kho không hợp lệ'),
  referenceType: z.string().max(50).optional(),
  referenceId: z.number().int().positive().optional(),
  reason: z.string().max(255).optional(),
  notes: z.string().max(500).optional(),
  details: z
    .array(transactionDetailSchema)
    .min(1, 'Cần ít nhất một mặt hàng')
    .max(100, 'Tối đa 100 mặt hàng cho mỗi giao dịch'),
});

export const createTransferSchema = z
  .object({
    sourceWarehouseId: z.number().int().positive('Id kho nguồn không hợp lệ'),
    destinationWarehouseId: z.number().int().positive('Id kho đích không hợp lệ'),
    reason: z.string().max(255).optional(),
    notes: z.string().max(500).optional(),
    details: z
      .array(transactionDetailSchema)
      .min(1, 'Cần ít nhất một mặt hàng')
      .max(100, 'Tối đa 100 mặt hàng cho mỗi giao dịch'),
  })
  .refine((data) => data.sourceWarehouseId !== data.destinationWarehouseId, {
    message: 'Kho nguồn và kho đích phải khác nhau',
    path: ['destinationWarehouseId'],
  });

export const createDisposalSchema = z.object({
  warehouseId: z.number().int().positive('Id kho không hợp lệ'),
  reason: z.string().min(1, 'Lý do là bắt buộc cho việc thanh lý').max(255),
  notes: z.string().max(500).optional(),
  details: z
    .array(transactionDetailSchema)
    .min(1, 'Cần ít nhất một mặt hàng')
    .max(100, 'Tối đa 100 mặt hàng cho mỗi giao dịch'),
});

export const createStocktakeSchema = z.object({
  warehouseId: z.number().int().positive('Id kho không hợp lệ'),
  reason: z.string().max(255).optional(),
  notes: z.string().max(500).optional(),
  details: z
    .array(
      z.object({
        productId: z.number().int().positive('Id sản phẩm không hợp lệ'),
        systemQuantity: z.number().min(0, 'Số lượng hệ thống không thể âm'),
        actualQuantity: z.number().min(0, 'Số lượng thực tế không thể âm'),
        batchNumber: z.string().max(100).optional(),
        notes: z.string().max(500).optional(),
      })
    )
    .min(1, 'Cần ít nhất một mặt hàng')
    .max(100, 'Tối đa 100 mặt hàng cho mỗi giao dịch'),
});

export const transactionQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().trim().optional(),
  transactionType: z.enum(['import', 'export', 'transfer', 'disposal', 'stocktake']).optional(),
  warehouseId: z.string().optional(),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['draft', 'pending', 'approved', 'completed', 'cancelled']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const transactionIdSchema = z.object({
  id: z.string().transform(Number),
});

export const approveTransactionSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const cancelTransactionSchema = z.object({
  reason: z.string().min(1, 'Lý do là bắt buộc cho việc hủy bỏ').max(500),
});

export const quickAdjustInventorySchema = z.object({
  warehouseId: z.number().int().positive('Id kho không hợp lệ'),
  productId: z.number().int().positive('Id sản phẩm không hợp lệ'),
  adjustmentType: z.enum(['disposal', 'stocktake']),
  quantity: z.number().min(0, 'Số lượng phải không âm'),
  actualQuantity: z.number().min(0, 'Số lượng thực tế phải không âm').optional(),
  reason: z.string().min(1, 'Lý do là bắt buộc').max(255),
});

export type CreateImportInput = z.infer<typeof createImportSchema>;
export type CreateExportInput = z.infer<typeof createExportSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type CreateDisposalInput = z.infer<typeof createDisposalSchema>;
export type CreateStocktakeInput = z.infer<typeof createStocktakeSchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
export type TransactionIdInput = z.infer<typeof transactionIdSchema>;
export type ApproveTransactionInput = z.infer<typeof approveTransactionSchema>;
export type CancelTransactionInput = z.infer<typeof cancelTransactionSchema>;
export type QuickAdjustInventoryInput = z.infer<typeof quickAdjustInventorySchema>;
