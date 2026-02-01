import { z } from 'zod';

export const createDeliverySchema = z.object({
  body: z.object({
    orderId: z.number().int().positive('Order ID must be positive'),
    deliveryStaffId: z.number().int().positive('Delivery staff ID must be positive'),
    shippingPartner: z.string().max(100).optional(),
    deliveryDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid delivery date'),
    deliveryCost: z.number().min(0, 'Delivery cost must be non-negative').optional(),
    codAmount: z.number().min(0, 'COD amount must be non-negative').optional(),
    notes: z.string().max(255).optional(),
  }),
});

export const updateDeliverySchema = z.object({
  body: z.object({
    deliveryStaffId: z.number().int().positive().optional(),
    shippingPartner: z.string().max(100).optional(),
    deliveryDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), 'Invalid delivery date')
      .optional(),
    deliveryCost: z.number().min(0).optional(),
    notes: z.string().max(255).optional(),
  }),
});

export const startDeliverySchema = z.object({
  body: z.object({
    notes: z.string().max(255).optional(),
  }),
});

export const completeDeliverySchema = z.object({
  body: z.object({
    receivedBy: z.string().min(1).max(100, 'Receiver name required'),
    receivedPhone: z
      .string()
      .min(10, 'Phone must be at least 10 characters')
      .max(20, 'Phone must be at most 20 characters')
      .regex(/^[0-9+\-\s()]+$/, 'Invalid phone format'),
    collectedAmount: z.number().min(0, 'Collected amount must be non-negative').optional(),
    deliveryProof: z.string().max(500).optional(),
    notes: z.string().max(255).optional(),
  }),
});

export const failDeliverySchema = z.object({
  body: z.object({
    failureReason: z.string().min(10, 'Failure reason must be at least 10 characters').max(255),
    notes: z.string().max(255).optional(),
    cancelOrder: z.boolean().optional(),
  }),
});

export const settleCODSchema = z.object({
  body: z.object({
    notes: z.string().max(255).optional(),
  }),
});

export const deliveryQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    search: z.string().optional(),
    orderId: z.string().regex(/^\d+$/).transform(Number).optional(),
    deliveryStaffId: z.string().regex(/^\d+$/).transform(Number).optional(),
    deliveryStatus: z.enum(['pending', 'in_transit', 'delivered', 'failed']).optional(),
    settlementStatus: z.enum(['pending', 'settled']).optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>['body'];
export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>['body'];
export type StartDeliveryInput = z.infer<typeof startDeliverySchema>['body'];
export type CompleteDeliveryInput = z.infer<typeof completeDeliverySchema>['body'];
export type FailDeliveryInput = z.infer<typeof failDeliverySchema>['body'];
export type SettleCODInput = z.infer<typeof settleCODSchema>['body'];
export type DeliveryQueryInput = z.infer<typeof deliveryQuerySchema>['query'];
