import { Router } from 'express';
import salaryController from '@controllers/salary.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import {
  salaryQuerySchema,
  getSalaryByUserMonthSchema,
  calculateSalarySchema,
  updateSalarySchema,
  approveSalarySchema,
  paySalarySchema,
  recalculateSalarySchema,
  calculateBatchSalarySchema,
} from '@validators/salary.validator';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/salary - Get all salary records
router.get(
  '/',
  authorize('view_salary'),
  validate(salaryQuerySchema, 'query'),
  asyncHandler(salaryController.getAll.bind(salaryController))
);

// GET /api/salary/summary - Get salary summary
router.get(
  '/summary',
  authorize('view_salary'),
  asyncHandler(salaryController.getSummary.bind(salaryController))
);

// GET /api/salary/:userId/:month - Get salary by user and month
router.get(
  '/:userId/:month',
  authorize('view_salary'),
  validate(getSalaryByUserMonthSchema),
  asyncHandler(salaryController.getByUserAndMonth.bind(salaryController))
);

// GET /api/salary/:id - Get salary by ID
router.get(
  '/:id',
  authorize('view_salary'),
  asyncHandler(salaryController.getById.bind(salaryController))
);

// POST /api/salary/calculate - Calculate salary
router.post(
  '/calculate',
  authorize('calculate_salary'),
  validate(calculateSalarySchema),
  asyncHandler(salaryController.calculate.bind(salaryController))
);

// POST /api/salary/calculate-batch - Calculate batch salaries
router.post(
  '/calculate-batch',
  authorize('calculate_salary'),
  validate(calculateBatchSalarySchema),
  asyncHandler(salaryController.calculateBatch.bind(salaryController))
);

// POST /api/salary/:id/recalculate - Recalculate salary
router.post(
  '/:id/recalculate',
  authorize('calculate_salary'),
  validate(recalculateSalarySchema),
  asyncHandler(salaryController.recalculate.bind(salaryController))
);

// PUT /api/salary/:id - Update salary
router.put(
  '/:id',
  authorize('update_salary'),
  validate(updateSalarySchema),
  asyncHandler(salaryController.update.bind(salaryController))
);

// PUT /api/salary/:id/approve - Approve salary
router.put(
  '/:id/approve',
  authorize('approve_salary'),
  validate(approveSalarySchema),
  asyncHandler(salaryController.approve.bind(salaryController))
);

// POST /api/salary/:id/pay - Pay salary (create payment voucher)
router.post(
  '/:id/pay',
  authorize('pay_salary'),
  validate(paySalarySchema),
  asyncHandler(salaryController.pay.bind(salaryController))
);

// DELETE /api/salary/:id - Delete salary
router.delete(
  '/:id',
  authorize('delete_salary'),
  asyncHandler(salaryController.delete.bind(salaryController))
);

export default router;
