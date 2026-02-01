import { Router } from 'express';
import taskController from '../controllers/task.controller';
import { authentication } from '../middlewares/auth';

const router = Router();

router.use(authentication);

router.post('/', taskController.create);
router.get('/', taskController.findAll);
router.get('/:id', taskController.findOne);
router.put('/:id', taskController.update);
router.delete('/:id', taskController.delete);

export default router;
