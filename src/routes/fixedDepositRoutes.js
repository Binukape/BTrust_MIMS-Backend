import { Router } from 'express';
// Added middleware import
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  listFixedDeposits, getFixedDeposit, openFixedDeposit, earlyClosurePreview, closeEarly,
} from '../controllers/fixedDepositController.js';

const router = Router();


router.use(authenticateJWT);

router.get('/', requireRole('customer', 'agent', 'admin'), listFixedDeposits);
router.post('/', requireRole('customer', 'agent'), openFixedDeposit);
router.get('/:id', requireRole('customer', 'agent', 'admin'), getFixedDeposit);
router.get('/:id/early-closure-preview', requireRole('customer', 'agent'), earlyClosurePreview);
router.post('/:id/close-early', requireRole('customer', 'agent'), closeEarly);

export default router;
