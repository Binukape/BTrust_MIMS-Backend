import { Router } from 'express';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  listAccounts, getAccount, openAccount, changeStatus, closeAccount,
} from '../controllers/accountController.js';

const router = Router();
router.use(authenticateJWT);

router.get('/', requireRole('customer', 'agent', 'admin'), listAccounts);
router.post('/', requireRole('agent'), openAccount);
router.get('/:id', requireRole('customer', 'agent', 'admin'), getAccount);
router.post('/:id/status', requireRole('agent', 'admin'), changeStatus);
router.post('/:id/close', requireRole('agent', 'admin'), closeAccount);

export default router;
