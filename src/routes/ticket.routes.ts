import { Router } from 'express';
import ticketController from '@controllers/ticket.controller';
import { authentication } from '@middlewares/auth';
import { authorize } from '@middlewares/authorize';
import { validate } from '@middlewares/validate';
import { asyncHandler } from '@middlewares/errorHandler';
import { logActivityMiddleware } from '@middlewares/logger';
import {
  createTicketSchema,
  updateTicketSchema,
  queryTicketsSchema,
} from '@validators/ticket.validator';

const router = Router();

// All routes require authentication
router.use(authentication);

// GET /api/tickets - Get all tickets (with filtering)
router.get(
  '/',
  authorize('GET_CUSTOMER_CARE'),
  validate(queryTicketsSchema, 'query'),
  asyncHandler(ticketController.getAllTickets.bind(ticketController))
);

// GET /api/tickets/:id - Get ticket by ID
router.get(
  '/:id',
  authorize('GET_CUSTOMER_CARE'),
  asyncHandler(ticketController.getTicketById.bind(ticketController))
);

// POST /api/tickets - Create new ticket
router.post(
  '/',
  authorize('CREATE_CUSTOMER_CARE'),
  validate(createTicketSchema),
  logActivityMiddleware('create', 'ticket'),
  asyncHandler(ticketController.createTicket.bind(ticketController))
);

// PUT /api/tickets/:id - Update ticket
router.put(
  '/:id',
  authorize('UPDATE_CUSTOMER_CARE'),
  validate(updateTicketSchema),
  logActivityMiddleware('update', 'ticket'),
  asyncHandler(ticketController.updateTicket.bind(ticketController))
);

// PATCH /api/tickets/:id - Update ticket
router.patch(
  '/:id',
  authorize('UPDATE_CUSTOMER_CARE'),
  validate(updateTicketSchema),
  logActivityMiddleware('update', 'ticket'),
  asyncHandler(ticketController.updateTicket.bind(ticketController))
);

// DELETE /api/tickets/:id - Delete ticket
router.delete(
  '/:id',
  authorize('DELETE_CUSTOMER_CARE'),
  logActivityMiddleware('delete', 'ticket'),
  asyncHandler(ticketController.deleteTicket.bind(ticketController))
);

export default router;
