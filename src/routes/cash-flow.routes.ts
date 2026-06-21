import { Router } from 'express';
import { authentication } from '@middlewares/auth';
import { asyncHandler } from '@middlewares/errorHandler';
import cashFlowController from '@controllers/cash-flow.controller';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/cash-flow - Lấy danh sách sổ quỹ / báo cáo thu chi
router.get('/', asyncHandler(cashFlowController.getCashFlowReport));

export default router;
