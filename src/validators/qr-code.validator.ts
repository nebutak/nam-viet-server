import { z } from 'zod';

// Generate QR Code Schema
export const generateQRSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
  shift: z.enum(['morning', 'afternoon', 'all_day']).optional(),
  type: z.enum(['check_in', 'check_out']).optional(),
  clientUrl: z.string().url().optional().or(z.string().length(0)),
}).refine(data => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end >= start;
}, {
  message: 'End date must be on or after start date',
  path: ['endDate'],
});

// Scan QR Code Schema
export const scanQRSchema = z.object({
  qrData: z.string().min(1, 'QR data is required'),
  location: z.string().optional(),
});

// Export types
export type GenerateQRInput = z.infer<typeof generateQRSchema>;
export type ScanQRInput = z.infer<typeof scanQRSchema>;
