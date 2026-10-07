import { Router } from 'express';
// import middleware
import {
  listFixedDeposits, getFixedDeposit, openFixedDeposit, earlyClosurePreview, closeEarly,
} from '../controllers/fixedDepositController.js';

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

//

router.use(authenticateJWT);

router.get('/', requireRole('customer', 'agent', 'admin'), listFixedDeposits);
router.post('/', requireRole('customer', 'agent'), openFixedDeposit);
router.get('/:id', requireRole('customer', 'agent', 'admin'), getFixedDeposit);
router.get('/:id/early-closure-preview', requireRole('customer', 'agent'), earlyClosurePreview);
router.post('/:id/close-early', requireRole('customer', 'agent'), closeEarly);

export default router;
