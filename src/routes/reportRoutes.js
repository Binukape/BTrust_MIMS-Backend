import { Router } from 'express';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { requireRole } from '../middleware/requireRole.js';
import { viewReport, exportReport } from '../controllers/reportController.js';

const router = Router();
router.use(authenticateJWT, requireRole('agent', 'admin'));

router.get('/:type/export', exportReport);
router.get('/:type', viewReport);

export default router;
