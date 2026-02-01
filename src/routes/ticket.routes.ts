import { Router } from 'express';
import ticketController from '../controllers/ticket.controller';
import { authentication } from '../middlewares/auth';

const router = Router();

router.use(authentication);

router.post('/', ticketController.create);
router.get('/', ticketController.findAll);
router.get('/:id', ticketController.findOne);
router.put('/:id', ticketController.update);
router.delete('/:id', ticketController.delete);

export default router;
