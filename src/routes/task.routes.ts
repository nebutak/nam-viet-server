import { Router } from 'express';
import taskController from '@controllers/task.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import { logActivityMiddleware } from '@middlewares/logger';
import {
  createTaskSchema,
  updateTaskSchema,
  queryTasksSchema,
} from '@validators/task.validator';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/tasks - Get all tasks (with filtering)
router.get(
  '/',
  authorize('GET_TASK'),
  validate(queryTasksSchema, 'query'),
  asyncHandler(taskController.getAllTasks.bind(taskController))
);

// GET /api/tasks/:id - Get task by ID
router.get(
  '/:id',
  authorize('GET_TASK'),
  asyncHandler(taskController.getTaskById.bind(taskController))
);

// POST /api/tasks - Create new task
router.post(
  '/',
  authorize('CREATE_TASK'),
  validate(createTaskSchema),
  logActivityMiddleware('create', 'task'),
  asyncHandler(taskController.createTask.bind(taskController))
);

// PUT /api/tasks/:id - Update task
router.put(
  '/:id',
  authorize('UPDATE_TASK'),
  validate(updateTaskSchema),
  logActivityMiddleware('update', 'task'),
  asyncHandler(taskController.updateTask.bind(taskController))
);

// PATCH /api/tasks/:id - Update task
router.patch(
  '/:id',
  authorize('UPDATE_TASK'),
  validate(updateTaskSchema),
  logActivityMiddleware('update', 'task'),
  asyncHandler(taskController.updateTask.bind(taskController))
);

// DELETE /api/tasks/:id - Delete task
router.delete(
  '/:id',
  authorize('DELETE_TASK'),
  logActivityMiddleware('delete', 'task'),
  asyncHandler(taskController.deleteTask.bind(taskController))
);

export default router;
