import { Router } from 'express';
import {
    deposit,
    withdraw,
    listTransactions
} from "../controllers/transactionController.js";

// Added import middleware
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { requireRole } from '../middleware/requireRole.js';


const router = Router();



router.use(authenticateJWT);

router.post('/deposit', requireRole('customer', 'agent'), deposit);
router.post('/withdraw', requireRole('customer', 'agent'), withdraw);
router.get('/', requireRole('customer', 'agent', 'admin'), listTransactions);

export default router;