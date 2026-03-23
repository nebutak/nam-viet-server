import { Router } from 'express';
import attendanceController from '@controllers/attendance.controller';
import qrCodeController from '@controllers/qr-code.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  attendanceQuerySchema,
  checkInSchema,
  checkOutSchema,
  updateAttendanceSchema,
  requestLeaveSchema,
  approveLeaveSchema,
  monthlyReportSchema,
  lockMonthSchema,
} from '@validators/attendance.validator';
import { generateQRSchema, scanQRSchema } from '@validators/qr-code.validator';
import { logActivityMiddleware } from '@middlewares/logger';
import multer from 'multer';

const router = Router();

// Setup multer for file uploads
const upload = multer({
  dest: './uploads/attendance/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    // Only allow Excel files
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];
    
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  },
});

// All routes require authentication
router.use(authentication);

// GET /api/attendance - Get all attendance records (Admin/Manager)
router.get(
  '/',
  authorize('VIEW_ATTENDANCE'),
  validate(attendanceQuerySchema, 'query'),
  asyncHandler(attendanceController.getAll.bind(attendanceController))
);

// GET /api/attendance/my - Get my attendance records
router.get(
  '/my',
  validate(attendanceQuerySchema, 'query'),
  asyncHandler(attendanceController.getMyAttendance.bind(attendanceController))
);

// GET /api/attendance/report - Monthly attendance report
router.get(
  '/report',
  authorize('VIEW_ATTENDANCE'),
  validate(monthlyReportSchema, 'query'),
  asyncHandler(attendanceController.getMonthlyReport.bind(attendanceController))
);

// GET /api/attendance/statistics - User attendance statistics
router.get(
  '/statistics',
  authorize('VIEW_ATTENDANCE'),
  validate(attendanceQuerySchema, 'query'),
  asyncHandler(attendanceController.getUserStatistics.bind(attendanceController))
);

// =====================================================
// QR CODE ROUTES (must come BEFORE /:id to avoid "qr" being matched as :id)
// =====================================================

// GET /api/attendance/qr - Get all QR codes
router.get(
  '/qr',
  authorize('VIEW_ATTENDANCE'),
  asyncHandler(qrCodeController.getAll.bind(qrCodeController))
);

// GET /api/attendance/qr/:id - Get QR code by ID
router.get(
  '/qr/:id',
  authorize('VIEW_ATTENDANCE'),
  asyncHandler(qrCodeController.getById.bind(qrCodeController))
);

// GET /api/attendance/:id - Get attendance by ID
router.get(
  '/:id',
  authorize('VIEW_ATTENDANCE'),
  asyncHandler(attendanceController.getById.bind(attendanceController))
);

// POST /api/attendance/check-in - Check in
router.post(
  '/check-in',
  validate(checkInSchema),
  logActivityMiddleware('check in', 'attendance'),
  asyncHandler(attendanceController.checkIn.bind(attendanceController))
);

// POST /api/attendance/check-out - Check out
router.post(
  '/check-out',
  validate(checkOutSchema),
  logActivityMiddleware('check out', 'attendance'),
  asyncHandler(attendanceController.checkOut.bind(attendanceController))
);

// POST /api/attendance/leave - Request leave
router.post(
  '/leave',
  validate(requestLeaveSchema),
  logActivityMiddleware('request leave', 'attendance'),
  asyncHandler(attendanceController.requestLeave.bind(attendanceController))
);

// PUT /api/attendance/:id - Update attendance (Admin)
router.put(
  '/:id',
  authorize('UPDATE_ATTENDANCE'),
  validate(updateAttendanceSchema),
  logActivityMiddleware('update', 'attendance'),
  asyncHandler(attendanceController.update.bind(attendanceController))
);

// PUT /api/attendance/:id/approve - Approve/Reject leave
router.put(
  '/:id/approve',
  authorize('APPROVE_LEAVE'),
  validate(approveLeaveSchema),
  logActivityMiddleware('approve leave', 'attendance'),
  asyncHandler(attendanceController.approveLeave.bind(attendanceController))
);

// POST /api/attendance/lock-month - Lock attendance month
router.post(
  '/lock-month',
  authorize('UPDATE_ATTENDANCE'),
  validate(lockMonthSchema, 'body'),
  logActivityMiddleware('lock month', 'attendance'),
  asyncHandler(attendanceController.lockMonth.bind(attendanceController))
);

// POST /api/attendance/unlock-month - Unlock attendance month
router.post(
  '/unlock-month',
  authorize('UPDATE_ATTENDANCE'),
  validate(lockMonthSchema, 'body'),
  logActivityMiddleware('unlock month', 'attendance'),
  asyncHandler(attendanceController.unlockMonth.bind(attendanceController))
);

// POST /api/attendance/import - Import attendance from file
router.post(
  '/import',
  authorize('UPDATE_ATTENDANCE'),
  upload.single('file'),
  logActivityMiddleware('import', 'attendance'),
  asyncHandler(attendanceController.importFromFile.bind(attendanceController))
);

// DELETE /api/attendance/:id - Delete attendance (Admin)
router.delete(
  '/:id',
  authorize('DELETE_ATTENDANCE'),
  logActivityMiddleware('delete', 'attendance'),
  asyncHandler(attendanceController.delete.bind(attendanceController))
);

// =====================================================
// QR CODE MUTATION ROUTES
// =====================================================

// POST /api/attendance/qr/generate - Generate QR code for attendance
router.post(
  '/qr/generate',
  authorize('UPDATE_ATTENDANCE'),
  validate(generateQRSchema),
  logActivityMiddleware('generate QR', 'attendance'),
  asyncHandler(qrCodeController.generate.bind(qrCodeController))
);

// POST /api/attendance/qr/scan - Scan QR code and check-in
router.post(
  '/qr/scan',
  validate(scanQRSchema),
  logActivityMiddleware('scan QR', 'attendance'),
  asyncHandler(qrCodeController.scan.bind(qrCodeController))
);

// PUT /api/attendance/qr/:id/deactivate - Deactivate QR code
router.put(
  '/qr/:id/deactivate',
  authorize('UPDATE_ATTENDANCE'),
  logActivityMiddleware('deactivate QR', 'attendance'),
  asyncHandler(qrCodeController.deactivate.bind(qrCodeController))
);

// DELETE /api/attendance/qr/:id - Delete QR code
router.delete(
  '/qr/:id',
  authorize('DELETE_ATTENDANCE'),
  logActivityMiddleware('delete QR', 'attendance'),
  asyncHandler(qrCodeController.delete.bind(qrCodeController))
);

export default router;
