import { Router } from 'express';
import overtimeController from '@controllers/overtime.controller';
import { authentication } from '@middlewares/auth';
import { requireRole } from '@middlewares/authorize';

const router = Router();

router.use(authentication);

// Get sessions
router.get('/', requireRole('admin', 'manager', 'hr'), overtimeController.getAll);
router.get('/:id', requireRole('admin', 'manager', 'hr'), overtimeController.getById);

// Create session
router.post('/', requireRole('admin', 'manager', 'hr'), overtimeController.createSession);

// Session actions
router.post('/:sessionId/employees', requireRole('admin', 'manager', 'hr'), overtimeController.addEmployees);
router.delete('/:sessionId/employees/:userId', requireRole('admin', 'manager', 'hr'), overtimeController.removeEmployee);
router.post('/:sessionId/close', requireRole('admin', 'manager', 'hr'), overtimeController.closeSession);

export default router;
