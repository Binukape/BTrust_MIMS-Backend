import { Router } from 'express';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { requireRole } from '../middleware/requireRole.js';
import { createCustomer, listCustomers, getCustomer } from '../controllers/customerController.js';

const router = Router();
router.use(authenticateJWT);

router.post('/', requireRole('agent'), createCustomer);
router.get('/', requireRole('agent', 'admin'), listCustomers);
router.get('/:id', requireRole('agent', 'admin', 'customer'), getCustomer);

export default router;
