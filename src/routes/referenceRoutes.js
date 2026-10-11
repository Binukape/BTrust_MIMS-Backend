import { Router } from 'express';
// Added import middleware
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { listSavingsPlans, listFdPlans } from '../controllers/fixedDepositController.js';

const router = Router();



router.use(authenticateJWT);

router.get('/savings-plans', listSavingsPlans);
router.get('/fd-plans', listFdPlans);

export default router;