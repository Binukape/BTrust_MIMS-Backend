import { Router } from 'express';
import {
    deposit,
    withdraw,
    listTransactions
} from "../controllers/transactionController.js";

// import middleware



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

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

router.use(authenticateJWT);

router.post('/deposit', requireRole('customer', 'agent'), deposit);
router.post('/withdraw', requireRole('customer', 'agent'), withdraw);
router.get('/', requireRole('customer', 'agent', 'admin'), listTransactions);

export default router;