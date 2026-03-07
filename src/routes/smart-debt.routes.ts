import { Router } from 'express';
import smartDebtController from '../controllers/smart-debt.controller'; 
import { authentication } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';

import { asyncHandler } from '../middlewares/errorHandler';

// ⚠️ Validator cũ không còn khớp với logic mới. 
// Bạn cần cập nhật file validator hoặc tạm thời comment lại để tránh lỗi 400 Bad Request.
// import { sendReconciliationEmailSchema } from '../validators/debt-reconciliation.validator';

const router = Router();

// Áp dụng xác thực cho tất cả các routes
router.use(authentication);

// =============================================================================
// 1. NHÓM READ & UTILITY
// =============================================================================

// 1. Check Integrity (Kiểm tra sai lệch dữ liệu)
router.get(
  '/check-integrity',
  authorize('VIEW_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.checkIntegrity.bind(smartDebtController))
);

// 1b. Export List of Integrity Issues (Xuất file danh sách )
router.get('/export-list', 
  authorize('VIEW_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.exportList.bind(smartDebtController))
);

// 2. Export PDF
// ⚠️ Frontend cần gọi: /api/smart-debt/123/pdf?type=customer&year=2025
router.get(
  '/:id/pdf',
  authorize('VIEW_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.exportPdf.bind(smartDebtController))
);

// 3. Get Detail (Chi tiết)
// ⚠️ Frontend cần gọi: /api/smart-debt/123?type=customer&year=2025
// (Phải đặt sau /:id/pdf để tránh nhầm lẫn "pdf" là một ID)
router.get(
  '/:id',
  authorize('VIEW_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.getById.bind(smartDebtController))
);

// 4. Get List (Danh sách tổng quan)
// Query params: page, limit, search, status, type, year...
router.get(
  '/',
  authorize('VIEW_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.getAll.bind(smartDebtController))
);

// =============================================================================
// 2. NHÓM SYNC ACTIONS (Đồng bộ công nợ)
// =============================================================================

// Sync nhanh 1 khách (Snapshot)
router.post(
  '/sync-snap',
  authorize('CREATE_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.syncSnap.bind(smartDebtController))
);

// Sync sâu 1 khách (Full History)
router.post(
  '/sync-full',
  authorize('CREATE_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.syncFull.bind(smartDebtController))
);

// Sync nhanh TOÀN BỘ (Snapshot Batch)
router.post(
  '/sync-snap-batch',
  authorize('CREATE_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.syncSnapBatch.bind(smartDebtController))
);

// Sync sâu TOÀN BỘ (Full Batch - Bảo trì)
router.post(
  '/sync-full-batch',
  authorize('CREATE_DEBT_RECONCILIATION'),
  asyncHandler(smartDebtController.syncFullBatch.bind(smartDebtController))
);

// =============================================================================
// 3. NHÓM EMAIL (Gửi thông báo)
// =============================================================================

// // Gửi email nhắc nợ / đối chiếu
// // Body: { type: 'customer', year: 2025 (optional), message: '...' }
// router.post(
//   '/:id/email',
//   authorize('send_debt_reconciliation_email'),
//   // validateNested(sendReconciliationEmailSchema), // ❌ Tạm tắt validate cũ
//   asyncHandler(smartDebtController.sendEmail.bind(smartDebtController))
// );

export default router;