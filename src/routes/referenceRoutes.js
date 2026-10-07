import { Router } from 'express';
// import middleware
import { listSavingsPlans, listFdPlans } from '../controllers/fixedDepositController.js';

const router = Router();

// Temporary middleware for testing
function authenticateJWT(req, _res, next) {
  req.user = {
    role: 'customer',
    customerId: 1,
    agentId: null,
  };
  next();
}
// 


router.use(authenticateJWT);

router.get('/savings-plans', listSavingsPlans);
router.get('/fd-plans', listFdPlans);

export default router;